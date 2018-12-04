var opts = {
  includeNodeEnv: true,
  console: { enabled: false },
  lambda: {
    enabled: true
  }
};
var log = require( './index' )( opts );

log.info( 'This is a message with no meta' );
log.info( 'This is a message with meta:', { foo: 'bar' } );
log.info( 'This is a message with a timestamp', { cameraId: 'xyz', timestamp: 1480957640764 } );
log.info( 'This is a fake stack', { trace: [], stack: "I am\na stck!" });
setTimeout( function() {
  a = b.c;
}, 5000 );
