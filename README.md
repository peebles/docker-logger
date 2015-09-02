docker-logger
=============

This logger module is designed to work nicely for programs running inside of docker containers.
It uses winston and a custom configuration to decide how and where to log messages.  It supports
a flexible syslog option for working with various cloud loggers including an ELK stack using
pure JSON messages.

Installation
------------

    npm install docker-logger

Usage
-----

    var log = require( 'docker-logger' )( config );
    log.error( 'This is an error', new Error( 'with an Error' ) );
    log.error( new Error( 'with just an Error' ) );
    log.info( 'a message', { with: 'custom meta data' } );
    log.info( { with: 'just custom meta data' } );
    // This will also log an error (unreferenced):
    foo.bar = 5;

Benefits
--------

1. Supports any mix of console, file and syslog outputs with independent log levels.
1. Formats error objects nicely and consistently across all error situations.
1. Can automatically exit (and let forever restart) under commonly unrecoverable situations.
1. Supports standard syslog RFC5424 or RFC3164 message sends to local or remote sysloggers.
1. Supports pure JSON message over TCP or UDP.

Configuration
-------------

The default configuration is:

    {
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
    }

The passed in configuration is merged with the default, with any passed in fields taking presidence.  So you may pass
a configuration with only the changes you want.  For example:

    var log = require( 'docker-logger' )({
        syslog: { enabled: true, type: 'UDP_META', port: 514 },
        file: { enabled: true: location: '/mnt/logs' }
    });
    
exitOn
------

The "exitOn" parameters control whether and under what circumstances this library will cause the running
script to exit.

* EADDRINFO - This is commonly produced when a webservice or other IP or hostname reference fails to resolve in DNS.
* errorFatal - This is caused when Bookshelf or Knex operations fail due to database connection problems.
* unhandledRejection - This is due to screwed up promise resolution.
* connectionErrors - When communication to the syslog server has errors.

Syslog Type
-----------

The syslog.type parameter controls how messages are formatted and sent to the syslog.server (when enabled).  If
set to RFC5424 or RFC3164, the message will be formatted accordingly and sent over UDP.  If the type is set
to UDP_META or TCP_META, the message will be converted into pure JSON and sent over either UDP or TCP.  In *_META mode,
the message will be formatted as follows:

    {
        program: NODE_SCRIPT_BASENAME,
        host: OS_HOSTNAME,
        level: MESSAGE_LEVEL, (info, error, debug, warn)
        message: LOG_MESSAGE,
        timestamp: **SEE_BELOW**,
        meta: { the metadata object, if any }
    }

The "timestamp" field defaults to now ( as an ISO date string ).  However, if you pass a "timestamp" field
as part of your metadata, this is plucked out AS A UNIX EPOCH and converted to ISO and used as the timestamp.
The original timestamp field inside the meta is removed.

The UDP_META and TCP_META formats are designed to be used with Logstash and Elastic Search (and probably
Kibana) to support the most flexible query environment.  The timestamp trick described above is so you can
write data in the past (for debugging perhaps) and be able to query and sort based on that timestamp.

Docker Considerations and Cloud Logging
---------------------

When a script is running in production in a docker container, disk space is a consern.  Writing logs to a file
can quickly lead to running out of disk space.  In a container, any writes to standard out or standard err are
captured by docker and saved into a file (so that "docker logs" works).  So when running in a container, its best
to get your logs off the machine and the way you do that with this library is with the "syslog" setting and using
a remote syslog server.

