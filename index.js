'use strict';

let winston = require( 'winston' );
let path = require( 'path' );
let fs = require( 'fs' );
let mkdirp = require( 'mkdirp' );
let defaultsDeep = require( 'lodash.defaultsdeep' );
let WinstonCloudWatch = require( 'winston-cloudwatch' );

// with my own custom hacks using glossy
require('./lib/winston-logstash');

function isEmpty( value ) {
  return Boolean(value && typeof value == 'object') && !Object.keys(value).length;
}

function defaultAppname() {
  return path.basename( process.argv[1] ).replace( /\.js$/, '' );
}

let configDefaults = {
  includeNodeEnv: false,
  exitOn: {
    EADDRINFO: true,
    errorFatal: true,
    unhandledRejection: true,
    connectionErrors: false,
  },
  syslog: {
    enabled: false,
    level: 'info',
    port: 3030,
    server: 'localhost',
    type: 'RFC5424',
    facility: 'local0',
  },
  meta: {
    enabled: false,
    level: 'info',
    port: 3031,
    server: 'localhost',
    type: 'RFC5424',
    facility: 'local0',
  },
  console: {
    enabled: true,
    level: 'info',
  },
  cloudwatch: {
    enabled: false,
    stringify: true
  },
  lambda: {
    emabled: false,
    stringify: true
  },
  file: {
    enabled: false,
    level: 'info',
    location: '/tmp',
  }
};

module.exports = function( _config, _appname ) {

  let config = defaultsDeep( _config, configDefaults );
  let appname = _appname || process.env.APP_NAME || defaultAppname();

  let transports = [];

  if ( config.console && config.console.enabled &&
       config.lambda && config.lambda.enabled ) {
         throw( new Error( 'Cannot enable both console and lambda at the same time!  Both write to stadout.' ) );
  }
  
  if ( config.console && config.console.enabled ) {
    transports.push(
      new (winston.transports.Console)({
	handleExceptions: true,
	humanReadableUnhandledException: true,

	level: config.console.level,
	timestamp: true,
	colorize: true,
	prettyPrint: function( meta ) {
	  if ( meta && meta.trace && meta.stack && meta.stack.length ) {
	    if ( Array.isArray( meta.stack ) )
	      return "\n" + meta.stack.slice(1).join( "\n" );
	    else
	      return "\n" + meta.stack;
	  }
	  if ( config.includeNodeEnv ) {
	    if ( ! meta ) meta = { env: process.env.NODE_ENV };
	    else if ( typeof meta === 'object' ) meta['env'] = process.env.NODE_ENV;
	  }
	  return JSON.stringify( meta );
	},
      })
    );
  }

  if ( config.syslog && config.syslog.enabled ) {
    transports.push(
      new (winston.transports.Glossy)({
	handleExceptions: true,
	humanReadableUnhandledException: true,

	level: config.syslog.level,
	json: true,

	type: config.syslog.type,
	facility: config.syslog.facility,
	
	node_name: appname,
	host: config.syslog.server,
	port: config.syslog.port,
	
	includeNodeEnv: config.includeNodeEnv,
      })
    );
  }

  if ( config.meta && config.meta.enabled ) {
    let metaConsole = new (winston.transports.Glossy)({
      handleExceptions: true,
      humanReadableUnhandledException: true,

      level: config.meta.level,
      json: true,
      
      type: config.meta.type,
      facility: config.meta.facility,
	
      node_name: appname,
      host: config.meta.server,
      port: config.meta.port,
      
      includeNodeEnv: config.includeNodeEnv,
    });
    winston.loggers.add( 'meta', {
      transports: [ metaConsole ],
    });
  }

  if ( config.file && config.file.enabled ) {
    try {
      if ( ! fs.lstatSync( config.file.location ).isDirectory() )
        mkdirp.sync( config.file.location );
    } catch( err ) {
      console.log( 'Failed to create dir to store log file:', err.message );
      console.log( 'Falling back to /tmp...' );
      config.file.location = '/tmp';
    }
    transports.push(
      new (winston.transports.File)({
	handleExceptions: true,
	humanReadableUnhandledException: true,

	json: false,

	level: config.file.level,
	timestamp: true,
	prettyPrint: function( meta ) {
	  if ( meta && meta.trace && meta.stack && meta.stack.length ) {
	    if ( Array.isArray( meta.stack ) )
	      return "\n" + meta.stack.slice(1).join( "\n" );
	    else
	      return "\n" + meta.stack;
	  }
	  if ( config.includeNodeEnv ) {
	    if ( ! meta ) meta = { env: process.env.NODE_ENV };
	    else if ( typeof meta === 'object' ) meta['env'] = process.env.NODE_ENV;
	  }
	  return JSON.stringify( meta );
	},
	filename: path.join( config.file.location, appname + '.log' ),
      })
    );
  }

  if ( config.cloudwatch && config.cloudwatch.enabled ) {

    if ( config.cloudwatch.debug ) console.log( 'enabling cloudwatch logger with env:', process.env );

    let streamName = config.cloudwatch.stream || appname;

    let startTime = new Date().toISOString();
    const crypto = require('crypto');

    const formatError = (e, lvl) => {
      return {
        message: e.message,
        level: lvl || 'error',
        stack: e.stack
      };
    };

    transports.push(
      new WinstonCloudWatch({
        level: config.cloudwatch.level || 'debug',
        uploadRate: config.cloudwatch.uploadRate || 2000,
        retentionInDays: config.cloudwatch.retentionInDays || 0,
        handleExceptions: true,
        humanReadableUnhandledException: true,
        awsAccessKeyId: config.cloudwatch.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID,
        awsSecretKey: config.cloudwatch.awsSecretKey || process.env.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.cloudwatch.awsRegion || process.env.AWS_REGION,
        logGroupName: config.cloudwatch.group || process.env.NODE_ENV || 'local',
        logStreamName: () => {
          let date = new Date().toISOString().split('T')[0];
          return streamName + '.' + date + '-' +
                 crypto.createHash('md5')
                               .update(startTime)
                               .digest('hex');
        },
        messageFormatter: (msg) => {
          if ( msg instanceof Error ) msg = formatError( msg, msg.level );
          if ( msg.meta && msg.meta instanceof Error ) msg.meta = formatError( msg.meta, msg.level );
          msg.program = appname;
          if ( config.includeNodeEnv ) {
            msg.env = process.env.NODE_ENV;
          }
          if ( config.cloudwatch.debug ) console.log( 'writing to cloudwatch:', JSON.stringify( msg ) );
          msg.message = msg.msg;
          delete msg.msg;
          // Add ISO timestamp and "0-0" (request id) to make these strings look like console.log()s
          // in lambda functions.
          if ( config.cloudwatch.stringify ) 
            return `${new Date().toISOString()} 0-0 ${JSON.stringify( msg )}`;
          else
            return `${new Date().toISOString()} 0-0 ${msg}`;
        }
      })
    );
  }

  if ( config.lambda && config.lambda.enabled ) {
    const formatError = (e, lvl) => {
      return {
        message: e.message,
        level: lvl || 'error',
        stack: e.stack
      };
    };

    transports.push(
      new (winston.transports.Console)({
        handleExceptions: true,
        humanReadableUnhandledException: true,
        level: config.lambda.level,
        formatter: function(msg) {
          if ( msg instanceof Error ) msg = formatError( msg, msg.level );
          if ( msg.meta && msg.meta instanceof Error ) msg.meta = formatError( msg.meta, msg.level );
	  if ( msg.meta && msg.meta.trace && msg.meta.stack && msg.meta.stack.length ) {
            msg.meta = {
              stack: msg.meta.stack,
            };
          }
          msg.program = appname;
          if ( config.includeNodeEnv ) {
            msg.env = process.env.NODE_ENV;
          }
          let newMsg = {
            level: msg.level,
            message: msg.message,
            program: msg.program,
            env: msg.env,
            meta: msg.meta,
          };
          // Add ISO timestamp and "0-0" (request id) to make these strings look like console.log()s
          // in lambda functions.
          if ( config.lambda.stringify ) {
            return `${new Date().toISOString()} 0-0 ${JSON.stringify( newMsg )}`;
          }
          else {
            return `${new Date().toISOString()} 0-0 ${newMsg}`;
          }
        }
      })
    );
  }

  let logger = new (winston.Logger)({
    transports: transports,
  });

  return logger;
}
