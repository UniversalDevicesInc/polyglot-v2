# TODO List for Polyglot v2 development

__Legend:__
```
* complete
- TODO
! unable/impossible
```

```
Improve from 2.0.30:
- Logout on upgrade
- Restart NodeServer automatically after update from Store
```

```
Wishlist:
* Install nodeserver easily from github/store
* Profile.zip install from frontend automatically
! Auto-create ISY status variables for NS/Polyglot 'state'
* Run process.spawn for local nodeservers STDIN>STDOUT
* NodeServer/Remote NodeServer log display in frontent
* Fully update documentation/install guide
* Find place to store binaries
* Initial 401 Prominent error in frontend
* Encryption by default
* MQTT TLS
* Move Polls to Polyglot instead of API interface
* Add poll timer configuration to NodeServer Configuration page default 10/60 seconds
* Add websocket disconnection notification mechanism in frontend
* In-place Upgrade for Polyglot itself
* NodeServer update mechansim to allow re-upload of profile.zip if wanted
* Verify pool of threads for HTTP(S) - Verified by default, pooling, increased max connection pool size.
- Return node validation errors (stupid dashes)
- Rediscover ISY from settings page
- Add nodeserver versions from store. Existing vs available.
- Write Store functionality > probably separate system AWS lambda
- Add customParams addition and deletion api in polyinterface to allow nodeservers to store data in mongodb.
- Oauth flow integration for NodeServers like Nest into frontend? Not sure if possible.
```
