/*
 *
 * (C) 2013 Jaakko Suutarla
 * MIT LICENCE
 *
 */

var net = require('net'),
    util = require('util'),
    os = require('os'),
    tls = require('tls'),
    fs = require('fs'),
    glossy = require('glossy'),
    winston = require('winston'),
    common = require('winston/lib/winston/common');

var ECONNREFUSED_REGEXP = /ECONNREFUSED/;
var ETIMEDOUT_REGEXP = /ETIMEDOUT/;

var Glossy = exports.Glossy = function (options) {
  winston.Transport.call(this, options);
  options = options || {};

  this.name                = 'glossy';
  this.type                = options.type || 'TCP_META';
  this.facility            = options.facility || 'local0',
  this.localhost           = options.localhost || os.hostname();
  this.host                = options.host || '127.0.0.1';
  this.port                = options.port || 28777;
  this.node_name           = options.node_name || process.title;
  this.pid                 = options.pid || process.pid;
  this.max_connect_retries = ('number' === typeof options.max_connect_retries) ? options.max_connect_retries : 400;
  this.timeout_connect_retries = ('number' === typeof options.timeout_connect_retries) ? options.timeout_connect_retries : 100;
  this.retries             = -1;

  this.includeNodeEnv      = options.includeNodeEnv || false;
  
  // Support for winston build in logstash format
  // https://github.com/flatiron/winston/blob/master/lib/winston/common.js#L149
  this.logstash            = options.logstash || false;

  // SSL Settings
  this.ssl_enable          = options.ssl_enable || false;
  this.ssl_key             = options.ssl_key || '';
  this.ssl_cert            = options.ssl_cert || '';
  this.ca                  = options.ca || '';
  this.ssl_passphrase      = options.ssl_passphrase || '';
  this.rejectUnauthorized  = options.rejectUnauthorized === true;

  // Connection state
  this.log_queue           = [];
  this.connected           = false;
  this.socket              = null;

  // Miscellaneous options
  this.strip_colors        = options.strip_colors || false;
  this.label               = options.label || this.node_name;
  this.meta_defaults       = options.meta || {};

  // We want to avoid copy-by-reference for meta defaults, so make sure it's a flat object.
  for (var property in this.meta_defaults) {
    if (typeof this.meta_defaults[property] === 'object') {
      delete this.meta_defaults[property];
    }
  }

  if ( this.type == 'RFC5424' || this.type == 'RFC3164' ) {
    var GlossyProducer = glossy.Produce;
    this.producer = new GlossyProducer({
      host:     this.localhost,
      appName:  this.node_name,
      type:     this.type,
      facility: this.facility,
    });
  }

  this.connect();
};

//
// Inherit from `winston.Transport`.
//
util.inherits(Glossy, winston.Transport);

//
// Define a getter so that `winston.transports.Syslog`
// is available and thus backwards compatible.
//
winston.transports.Glossy = Glossy;

Glossy.prototype.name = 'glossy';

Glossy.prototype.log = function (level, msg, meta, callback) {
  var self = this,
      meta = winston.clone(meta || {}),
      log_entry;

  if ( meta && meta.trace && meta.stack && meta.stack.length ) {
    if ( Array.isArray( meta.stack ) )
      msg = msg + "\n" + meta.stack.slice(1).join( "\n" );
    else
      msg = msg + "\n" + meta.stack;
    meta = {};
  }
  
  for (var property in this.meta_defaults) {
    meta[property] = this.meta_defaults[property];
  }

  if (self.silent) {
    return callback(null, true);
  }

  if (self.strip_colors) {
    msg = msg.stripColors;

    // Let's get rid of colors on our meta properties too.
    if (typeof meta === 'object') {
      for (var property in meta) {
        meta[property] = meta[property].stripColors;
      }
    }
  }

  if ( this.includeNodeEnv && process.env.NODE_ENV ) {
    if ( ! meta ) meta = { env: process.env.NODE_ENV };
    else if ( typeof meta === 'object' ) meta['env'] = process.env.NODE_ENV;
  }

  if ( this.type == 'RFC5424' || this.type == 'RFC3164' ) {
    var args = [ '[' + level + ']', msg ];
    args.push( JSON.stringify( meta ) );
    log_entry = this.producer.produce({
      severity: level,
      message: args.join( ' ' ),
    });
  }
  else {
    log_entry = JSON.stringify({
      program: this.node_name,
      host: this.localhost,
      level: level,
      message: msg,
      meta: meta,
    });
  }

  if (!self.connected) {
    console.log( 'docker-logger: not connected, queuing:', log_entry );
    self.log_queue.push({
      message: log_entry,
      callback: function () {
        self.emit('logged');
        callback(null, true);
      }
    });
  } else {
    //console.log( 'docker-logger: send message!' );
    self.sendLog(log_entry, function () {
      self.emit('logged');
      callback(null, true);
    });
  }
};

Glossy.prototype.connect = function () {
  var tryReconnect = true;
  var options = {};
  var self = this;
  this.retries++;
  this.connecting = true;
  this.terminating = false;
  if (this.ssl_enable) {
    options = {
      key: this.ssl_key ? fs.readFileSync(this.ssl_key) : null,
      cert: this.ssl_cert ? fs.readFileSync(this.ssl_cert) : null,
      passphrase: this.ssl_passphrase ? this.ssl_passphrase : null,
      rejectUnauthorized: this.rejectUnauthorized === true,
      ca: this.ca ? (function (caList) {
        var caFilesList = [];

        caList.forEach(function (filePath) {
          caFilesList.push(fs.readFileSync(filePath));
        });

        return caFilesList;
      }(this.ca)) : null
    };
    this.socket = new tls.connect(this.port, this.host, options, function() {
      self.socket.setEncoding('UTF-8');
      self.announce();
      self.connecting = false;
    });
  } else {
    this.socket = new net.Socket();
  }

  this.socket.on('error', function (err) {
    self.connecting = false;
    self.connected = false;

    console.log( 'docker-logger: error:', err.message );
    
    if (typeof(self.socket) !== 'undefined' && self.socket != null) {
      self.socket.destroy();
    }

    if ( ETIMEDOUT_REGEXP.test( err.message ) ) {
      if (self.socket.readyState !== 'open') {
	self.socket.destroy();
      }
      return;
    }

    self.socket = null;
    if (!ECONNREFUSED_REGEXP.test(err.message)) {
      tryReconnect = false;
      //self.emit('error', err); NEVER EMIT AN ERROR
      console.log( 'error:', err );
    }
  });

  this.socket.on('timeout', function() {
    console.log( 'docker-logger: socket timeout' );
    if (self.socket.readyState !== 'open') {
      self.socket.destroy();
    }
  });

  this.socket.on('connect', function () {
    self.retries = 0;
  });

  this.socket.on('close', function (had_error) {
    self.connected = false;

    console.log( 'docker-logger: socket close' );
    
    if (self.terminating) {
      return;
    }

    if (self.max_connect_retries < 0 || self.retries < self.max_connect_retries) {
      if (!self.connecting) {
        setTimeout(function () {
	  console.log( 'docker-logger: retry reconnect' );
          self.connect();
        }, self.timeout_connect_retries);
      }
    } else {
      self.log_queue = [];
      self.silent = true;
      console.log( 'Max retries reached, transport in silent mode, OFFLINE' );
    }
  });

  if (!this.ssl_enable) {
    this.socket.connect(self.port, self.host, function () {
      self.announce();
      self.connecting = false;
    });
  }

};

Glossy.prototype.close = function () {
  var self = this;
  self.terminating = true;
  if (self.connected && self.socket) {
    self.connected = false;
    self.socket.end();
    self.socket.destroy();
    self.socket = null;
  }
};

Glossy.prototype.announce = function () {
  var self = this;
  self.connected = true;
  self.flush();
  if (self.terminating) {
    self.close();
  }
};

Glossy.prototype.flush = function () {
  var self = this;

  if ( self.log_queue.length )
    console.log( 'docker-logger: flushing', self.log_queue.length, 'messages' );
  
  for (var i = 0; i < self.log_queue.length; i++) {
    self.sendLog(self.log_queue[i].message, self.log_queue[i].callback);
  }
  self.log_queue.length = 0;
};

Glossy.prototype.sendLog = function (message, callback) {
  var self = this;
  callback = callback || function () {};

  self.socket.write(message + "\n", "utf8", function( err ) {
    if ( err ) console.log( 'docker-logger: send error:', err.message );
    callback();
  });
};

Glossy.prototype.getQueueLength = function () {
  return this.log_queue.length;
};
