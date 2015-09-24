var c = {
    file: {
	enabled: true,
    },
    syslog: {
	enabled: true,
	port: 3030,
	server: '52.0.83.232',
	type: 'UDP_META',
    },
    meta: {
	enabled: true,
	port: 3031,
	server: '52.0.83.232',
	type: 'TCP_META',
    }
};

var m = {
    "foo": "bar",
};

var log = require( './Logger' )( c );

log.info( 'Testing UDP syslog', m );

var mlog = require( 'winston' ).loggers.get( 'meta' );
mlog.info( 'Testing TCP meta', m, function( err ) {
    if ( err ) console.log( 'There was a tcp-meta error:', err );
    console.log( 'SENT META' );
    process.exit( 0 );
});

