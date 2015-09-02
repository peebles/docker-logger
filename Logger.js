var winston = require( "winston" );
var util = require( 'util' );
var mkdirp = require( 'mkdirp' );
var fs = require( 'fs' );
var dgram = require( 'dgram' );
var net = require( 'net' );
var glossy = require('glossy')
var _ = require( 'lodash' );
var path = require( 'path' );
var moment = require( 'moment' );

var _log;

function isEmpty( value ) {
    return Boolean(value && typeof value == 'object') && !Object.keys(value).length;
}

function defaultAppname() {
    return path.basename( process.argv[1] ).replace( /\.js$/, '' );
}

var configDefaults = {
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
    console: {
	enabled: true,
	level: 'info',
    },
    file: {
	enabled: false,
	level: 'info',
	location: '/tmp',
    }
};

module.exports = function( config, appname ) {
    if ( _log ) return _log;

    config = config || {};
    _.defaultsDeep( config, configDefaults );

    var _appname = appname || defaultAppname();
    var _level = config.syslog.level || 'info';
    var _port  = config.syslog.port  || 3030;
    var _server = config.syslog.server || 'localhost';
    
    var SysLogger = winston.transports.SysLogger = function( options ) {
        this.name  = 'sysLogger';
        this.ident = _appname;
        this.level = _level;

	// If config.syslog.type matches one of the known RFC types,
	// create a producer for sending syslog-complient messages.
	if ( config.syslog.type == 'RFC5424' ||
	     config.syslog.type == 'RFC3164' ) {
            var GlossyProducer = glossy.Produce;
            this.producer = new GlossyProducer({
		host:     require('os').hostname(),
		appName:  this.ident,
		type:     config.syslog.type,
		facility: config.syslog.facility,
            });
	}
    };
    util.inherits( SysLogger, winston.Transport );

    SysLogger.prototype.log = function( level, msg, meta, callback ) {

	// with uncaught exceptions, level can be undefined
	level = level || 'error';

	if ( _.isObject( meta ) ) {
	    if ( meta instanceof Error ) {
		msg = msg + meta.stack;
	    }
	    else if ( meta.stack && meta.stack.length ) {
		msg = msg + meta.stack.join("\n");
		meta = {};
	    }
	    else {
		if ( meta.timestamp ) {
		    meta.timestamp = moment.unix( meta.timestamp ).toISOString();
		}
		else {
		    meta.timestamp = moment().toISOString();
		}
	    }
	}

	if ( config.syslog.type == 'RFC5424' || config.syslog.type == 'RFC3164' ) {
	    var args = [ '[' + level + ']', msg ];
	    args.push( JSON.stringify( meta ) );
	    msg = this.producer.produce({
		severity: level,
		message: args.join( ' ' ),
            });
	}
	else if ( config.syslog.type == 'UDP_META' || config.syslog.type == 'TCP_META' ) {
	    msg = JSON.stringify({
		program: _appname,
		host: require('os').hostname(),
		level: level,
		message: msg,
		meta: meta,
	    });
	}
	else {
	    console.log( 'Logger: unsupported config.syslog.type:', config.syslog.type );
	    process.exit(1);
	}

	if ( config.syslog.type == 'UDP_META' || config.syslog.stype.match( /^RFC/ ) ) {
            try {
		var client = dgram.createSocket('udp4');
		client.send( new Buffer( msg ), 0, msg.length, _port, _server, function( err, bytes ) {
		    if ( err ) {
			if ( config.exitOn.connectionErrors ) {
			    console.log( 'UDP_META connection problems:', err.message );
			    process.exit(1);
			}
		    }
                    client.close();
		    if ( config.exitOn.EADDRINFO && msg.match( 'EADDRINFO' ) ) process.exit(1);
                    if ( callback ) callback( null, true );
		});
            } catch( err ) {
		if ( config.exitOn.connectionErrors ) {
		    console.log( 'UDP_META connection problems:', err.message );
		    process.exit(1);
		}
            }
	}
	else if ( config.syslog.type == 'TCP_META' ) {
	    try {
		var socket = new net.Socket();
		socket.connect( _port, _server, function( err ) {
		    if ( err ) {
			console.log( err );
			if ( config.exitOn.connectionErrors ) {
			    console.log( 'TCP_META connection problems:', err.message );
			    process.exit(1);
			}
		    }
		    else {
			socket.write( msg + "\n", function( err ) {
			    if ( err ) {
				if ( config.exitOn.connectionErrors ) {
				    console.log( 'TCP_META connection problems:', err.message );
				    process.exit(1);
				}
			    }
			    socket.end();
			});
		    }
		});
	    } catch( err ) {
		if ( config.exitOn.connectionErrors ) {
		    console.log( 'TCP_META connection problems:', err.message );
		    process.exit(1);
		}
	    }
	}
    };

    // Uncaught exceptions generate a meta object that is not an instance of Error, but
    // contain a stack (as an array, not a string!) and a bunch of other stuff we usually
    // do not care about.  This function monkeys with this meta object to turn it into
    // something more digestable.
    //
    function patchMeta( logger ) {
	var __log = logger.log;
	logger.log = function() {
	    var args     = Array.prototype.slice.call(arguments);
            var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            var meta     = typeof args[args.length - 1] === 'object' ? args.pop() : null;

	    if ( meta ) {
		if ( meta instanceof Error ) {
		    if ( config.exitOn.errorFatal ) {
			// This is a check for fatal errors which will cause the process to exit, to
			// be restarted by forever.  These errors include Bookshelf/Knex.
			if ( meta.fatal || ( meta.code && meta.code.match( /^ER_/ ) ) ) {
                            var code = ( meta.code && meta.code.match( /^ER_/ ) ) ? meta.code : '';
                            callback = function() {
				__log.apply( logger, [ 'error', 'Fatal error detected, shutting down.', code, function() {
                                    setTimeout( function() {
					process.exit(1);
                                    }, 1000 );
				}]);
                            }
			}
		    }
		}
		else if ( meta.stack && meta.stack.length ) {
		    // This is the unhandled exception case
		    var e = new Error( meta.stack[0] );
		    e.stack = meta.stack.join( "\n" );
		    meta = e;
		}
		args.push( meta );
	    }
	    if (callback) args.push(callback);
            __log.apply( logger, args );
	};
    }

    var syslogExceptions = new SysLogger({
        prettyPrint: true,
        appname: _appname,
        level: _level
    });

    var syslogConsole = new SysLogger({
        appname: _appname,
        level: _level
    });

    _transports = [];
    _exceptions = [];

    if ( config.syslog.enabled ) {
	_transports.push( syslogConsole );
	_exceptions.push( syslogExceptions );
	patchMeta( syslogExceptions );
    }

    if ( config.console.enabled ) {
	var c = new (winston.transports.Console)({ 
            prettyPrint: function( meta ) {
		return JSON.stringify( meta );
            },
            colorize: true,
            level: config.console.level,
            timestamp: true,
	});
	_transports.push( c );
	c = new (winston.transports.Console)({ 
            prettyPrint: function( meta ) {
		return JSON.stringify( meta );
            },
            colorize: true,
            level: config.console.level,
            timestamp: true,
	});
	_exceptions.push( c );
	patchMeta( c );
    }

    if ( config.file.enabled ) {
	try {
	    if ( ! fs.lstatSync( config.file.location ).isDirectory() )
		mkdirp.sync( config.file.location );
	} catch( err ) {
	    console.log( 'Failed to create dir to store log file:', err.message );
	    console.log( 'Falling back to /tmp...' );
	    config.file.location = '/tmp';
	}
	var c = new (winston.transports.File)({ 
            prettyPrint: function( meta ) {
		return JSON.stringify( meta );
            },
            json: false, 
            level: config.file.level,
            filename: config.file.location + '/' + _appname + '.log',
	});
	_transports.push( c );
	c = new (winston.transports.File)({ 
            prettyPrint: function( meta ) {
		return JSON.stringify( meta );
            },
            json: false, 
            level: config.file.level,
            filename: config.file.location + '/' + _appname + '.log',
	});
	_exceptions.push( c );
	patchMeta( c );
    }
    
    _log = new (winston.Logger)({
        transports: _transports,
        exceptionHandlers: _exceptions,
        exitOnError: true        // running under forever, let the process die
    });

    patchMeta( _log );

    if ( config.exitOn.unhandledRejection ) {
	// This seems like a new behavior (promises), and is not handled by Winston!
	// So in order that they do not slip by, we'll handle them.
	process.on( "unhandledRejection", function( err ) {
            _log.error( err );
	});
    }

    return _log;
};

