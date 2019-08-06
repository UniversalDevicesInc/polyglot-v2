# __Changelog for Polyglot v2__

### Version 2.2.0

* NodeJS 9.1.2
* Frontend changes to support log package and log downloading
* Frontend organization cleanup
* Added Polyglot restart button
* Cleaned up log windows with scrolling
* Fixed several nodeservers not showing acurate status

### Version 2.1.2

* Moved addNode/updateNode logic into Polyglot removed from polyinterfaces
* Added update script to run on all future upgrades to automatically upgrade polyinterfaces
* Added change nodeDef call if nodeDefId is changed for a node
* Added change API for ns to change nodeDefId if necessary
* sendResult bug fix where sometimes node.start() wasn't called
* Documentation updates

### Version 2.1.1

* Upgraded to Angular 5 for Frontend interface
* Migrated from Paho to MQTT.JS for Frontend MQTT Client
* Fixed Angular 5 Modal
* Added Uptime/Started At Frontend messages
* Fixed MQTT inconsistencies with Aedes
* Completely re-wrote the db calls
* Moved to ISY Keep-alive for increased speed
* Increased overall speed roughly 3000% on adds/driver updates
* Dropped CPU/mem usage by roughly 60%
* Drivers automatically sync to ISY on node add for 'initialization'
* Drivers automatically sync to ISY on startup from previously save values
* Restructured database, no breaking changes at the moment, eventually moving to multi-add interface
* Allow HTTP non-secure configuration option
* Specify IP to help with Docker builds

### Version 2.1.0

* Fixed graceful shutdowns and error catches to properly (and cleanly) shut down.
* Binaries moved to UDI AWS S3 bucket. Removed from github completely
* Fixed update node not pulling the new version correctly
* Fixed uninstall nodeserver failing
* Restructured most of the project in prep for unit testing
* Added check for ISY firmware > 5.0.0
* Changed to read profile directly instead of profile.zip
* Moved from Mosca MQTT Server to Aedes
* Major update to startup/shutdown and data flows
* Added NodeServer self-service addition button
* Added documentation link to github repo for each NodeServer

### Version 2.0.36

* Binaries moved to S3 (will remove from git completely in 2.1.0)
* Dynamic lamdba Store and added NodeServer version support (thanks xKing)
* Fixed per nodeserver queue for stability and rate limits
* Re-wrote majority of functions into es2017 async/await structures
* Re-wrote startup functions
* Re-structured dependencies
* Overhaul of all intrinsic mqtt functions to be more efficient
* Changed store layout
* Added customData for nodeserver storage
* Removed auto-reboot functions as they are no longer necessary


### Version 2.0.35

* Moved to UDI github Repo
* Completely re-wrote the addnode functions to not be terrible, moved to ES7+ async await
* Added NodeServer customdata API
* Implemented inQ's per NodeServer to throttle inbound traffic
* Implemented outQ to ISY for concurrency to help connection stability
* Started code cleanup and unit testing
* Restores deleted ISY nodes on NodeServer restart
* Handles retries to ISY for connection errors

### Version 2.0.32 - 34

* Worked on duplicate node bug

### Version 2.0.31

* Added custom certificate ability, see README
* Fixed addnode bug where duplicates were possible
* Fixed removenode callback bug
* Multiple primaries can now be added (requires polyinterface 2.0.6+)
* Dynamic updates to drivers by allowing overwrite adds to nodes

### Version 2.0.30

* Fixed spacing on NodeServer Store page
* Skip Auto-Detection of ISY if ISY_HOST is defined in .env
* Added prompt to update profile and reboot on NodeServer git update
* Cleaned up some frontend message parsing

### Version 2.0.29

* Fixed customParams deletion of last key from frontend
* Verified port override works in .env
* Added better connection handling to frontend
* Prominent disconnect notice from backend
* Better reconnection and recovery mechanism for Frontend
* Added shortPoll/longPoll configuration items
* Renamed Custom Params to Configuration to house all future frontend config options
* Added fix for mongoose and mogodb 3.6.0+ $pushAll deprecation
* Added OSX binary and instructions
* Cleaned up localStorage from frontend
* Fixed ISY HTTPS connection issues
* Fixed issue with NodeServer 10 not getting commands properly
* Added delete call from Polyglot to NodeServer to allow for cleanup if necessary
* Added Automated In-Place Upgrade process
* Moved to NodeJS 8 for binary packaging


### Version 2.0.28

* SSL Generation bug addressed for some users. TLS x509 v3 Subject Alternate Name Type 7
* SSL Generation bug ended up being type 7 ip instead of type 7 value
* Added development environment document

### Version 2.0.27

* Added Automatic NodeServer controller ST variable updates into Polyglot itself upon connection/disconnection to reflect realtime state in ISY
* Cleaned up some for loops and moved to the more efficient array.find
* Cleaned up database field names to proper camelCase
* Fixed multiple files in profile.zip bug

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
