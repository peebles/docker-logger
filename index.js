'use strict';

let winston = require( 'winston' );
let path = require( 'path' );
let fs = require( 'fs' );
let mkdirp = require( 'mkdirp' );
let defaultsDeep = require( 'lodash/defaultsDeep' );

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

  if ( config.console.enabled ) {
    transports.push(
      new (winston.transports.Console)({
	handleExceptions: true,
	humanReadableUnhandledException: true,

	level: config.console.level,
	timestamp: true,
	colorize: true,
	prettyPrint: function( meta ) {
	  if ( meta && meta.trace && meta.stack && meta.stack.length ) {
	    return "\n" + meta.stack.slice(1).join( "\n" );
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

  if ( config.syslog.enabled ) {
    transports.push(
      new (winston.transports.Logstash)({
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

  if ( config.meta.enabled ) {
    transports.push(
      new (winston.transports.Logstash)({
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
      })
    );
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
    transports.push(
      new (winston.transports.File)({
	handleExceptions: true,
	humanReadableUnhandledException: true,

	json: false,

	level: config.file.level,
	timestamp: true,
	prettyPrint: function( meta ) {
	  if ( meta && meta.trace && meta.stack && meta.stack.length ) {
	    return "\n" + meta.stack.slice(1).join( "\n" );
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

  let logger = new (winston.Logger)({
    transports: transports,
  });

  return logger;
}
