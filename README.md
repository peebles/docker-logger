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
        meta: {
            enabled: false,
            level: 'info',
            port: 3031,
            server: 'localhost',
            type: 'TCP_META',
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
          enabled: false,
          level: 'debug',
          stringify: true
          awsAccessKeyId: 'your key',
          awsSecretKey: 'your secret',
          awsRegion: 'your region',
          group: 'cloud watch group name',
          stream: 'cloud watch stream name'
        },
        lambda: {
          enabled: false,
          level: 'debug',
          stringify: true
        }
    }

The passed in configuration is merged with the default, with any passed in fields taking presidence.  So you may pass
a configuration with only the changes you want.  For example:

    var log = require( 'docker-logger' )({
        syslog: { enabled: true, type: 'UDP_META', port: 514 },
        file: { enabled: true: location: '/mnt/logs' }
    });

META Logger
-----------

Sometimes you may wish to log pure metadata, in particular to Elasticsearch via logstash.  You can do this
my enabling the "meta" section, and thin in your code:

    var mlog = require( 'winston' ).loggers.get( 'meta' );
    mlog.info( 'my-object', { "key": "val" }, function( err ) {} );

This logger will not go to console or to file.  It is intended only to get JSON objects into elastic search.
    
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
        meta: { the metadata object, if any, with timestamp added }
    }

A "timestamp" field is added to meta and defaults to now ( as an ISO date string ).  However, if you pass a "timestamp" field
as part of your metadata, this is interpretted AS A UNIX EPOCH and converted to ISO and written back as the timestamp.

The UDP_META and TCP_META formats are designed to be used with Logstash and Elastic Search (and probably
Kibana) to support the most flexible query environment.  The timestamp trick described above is so you can
write data in the past (for debugging perhaps) and be able to query and sort based on that timestamp.

CloudWatch
----------

The AWS credentials will default (if not specified) to these environment variables:

* AWS_ACCESS_KEY_ID
* AWS_SECRET_ACCESS_KEY
* AWS_REGION

The CloudWatch `group` will default to process.env.NODE_ENV if not specified.  The `stream` name defaults to the
environment variable APP_NAME.

The idea is to group multiple applications under their stack, so you can use something like
[awslogs](https://github.com/jorgebastida/awslogs) and get logs like this to mix all of the apps in the stack together:

```sh
awslogs get staging ALL --start='1d ago' --timestamp --profile aws-profile-name
```

or to get just one app:

```sh
awslogs get staging "webserver*" --start='1d ago' --timestamp --profile aws-profile-name
```

Lambda
------

When a function is executing as a Lambda function, about the best you can do is write to the console.  This will incure no
hit on the user latency and automatically write into CloudWatch.  The "lambda" section of this model's config uses the
winston `Console` transport, but formats the message to be consistent with `CloudWatch` above.  This means you can use
"cloudwatch" for long running servers and "lambda" for lambda functions and the messages will be consistent.  Namely they
will be in JSON and have this format:

```js
{
  level: "LEVEL",
  message: "MESSAGE",
  program: "PROGRAM_NAME", // typically process.env.APP_NAME
  env: "NODE_ENV", // if includeNodeEnv==true
  meta: { meta }
}
```

If the entire stack is running with "cloudwatch" and "lambda" then you can consistently use something like:

```sh
awslogs get /aws/lambda/db-server  ALL --start='1d ago' --query='[level,message]' --timestamp --filter-pattern='{$.level = "info"}' --profile sm
```

Also, [see this article](https://theburningmonk.com/2017/08/centralised-logging-for-aws-lambda/) on ideas for how to
aggregate these logs to some central long term storage.


Docker Considerations and Cloud Logging
---------------------

When a script is running in production in a docker container, disk space is a consern.  Writing logs to a file
can quickly lead to running out of disk space.  In a container, any writes to standard out or standard err are
captured by docker and saved into a file (so that "docker logs" works).  So when running in a container, its best
to get your logs off the machine and the way you do that with this library is with the "syslog" setting and using
a remote syslog server.

