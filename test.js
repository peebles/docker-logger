var opts = {
  includeNodeEnv: true,
  exitOn: {
    EADDRINFO: true,
    errorFatal: true,
    unhandledRejection: true,
    connectionErrors: false,
  },
  syslog: {
    enabled: true,
    level: 'info',
    port: 3030,
    server: '52.36.116.222',
    type: 'TCP_META'
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
    enabled: true,
    level: 'info',
    location: '/tmp',
  }
};
var log = require( './index' )( opts );

log.info( 'This is a message with no meta' );
log.info( 'This is a message with meta:', { foo: 'bar' } );
log.info( 'This is a message with a timestamp', { cameraId: 'xyz', timestamp: 1480957640764 } );
setTimeout( function() {
  a = b.c;
}, 1000 );
