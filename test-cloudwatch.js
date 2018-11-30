var opts = {
  includeNodeEnv: true,
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
    enabled: false,
    level: 'info',
    location: '/tmp',
  },
  cloudwatch: {
    enabled: true
  }
};
var log = require( './index' )( opts );

if ( ! ( process.env.NODE_ENV ) ) {
  console.log( 'Please set NODE_ENV for this test.  That will be the CW group.' );
  process.exit();
}

if ( ! ( process.env.APP_NAME ) ) {
  console.log( 'Please set APP_NAME for this test.  That will be the CW stream base.' );
  process.exit();
}

log.info( 'This is a message with no meta' );
log.info( 'This is a message with meta:', { foo: 'bar' } );
log.info( 'This is a message with a timestamp', { cameraId: 'xyz', timestamp: 1480957640764 } );
log.info( 'This is a fake stack', { trace: [], stack: "I am\na stck!" });
setTimeout( function() {
  a = b.c;
}, 5000 );
