# __Changelog for Polyglot v2__

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
