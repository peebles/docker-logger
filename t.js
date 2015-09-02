var c = {
    file: {
	enabled: true,
    },
    syslog: {
	enabled: true,
	port: 3030,
	server: '52.88.30.164',
	type: 'UDP_META',
    }
};
var log = require( './Logger' )( c );

log.info( 'Testing TCP META', c );

