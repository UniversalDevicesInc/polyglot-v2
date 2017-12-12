# __Changelog for Polyglot v2__

### Version 2.0.26

* Moved polling mechanism for NodeServers from client to server side
* Created NodeServer template for python2/3
* Added shortPoll/longPoll initial configurable timers in server.json
* Fixed frontend bug finds
* Updated polyinterface to be python2 and 3 compatible
* Added 'localhost' to certificate SANs for Python2 compatibility

### Version 2.0.25

* TLS/SSL End to end by default.
* Certificate generation on initial startup with hostname/IP
  * Stored in database and written out to ~/.polyglot/ssl/ on startup to protect against deletion
* MQTT IPC and Frontend <> Backend encryption by default with TLS/SSL client/server certs
* Implemented Automatic authorization for MQTT between IPC/Frontend with MQTT
* Normalized Secure Websockets to same port as HTTPS for ease of administration for frontend.
  * 3000 by default
* Added prominent warning if ISY not connected on Frontend.
* Started changelog...
