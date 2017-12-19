
### OSX Install walkthrough

XCode developer tools
```
xcode-select --install
```

Homebrew Install
```
/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
```

MongoDB/Python2/Python3/wget Install
```
brew install mongodb python2 python3 wget
```

Create MongoDB Data Directory
```
sudo mkdir -p /data/db
```

Install Homebrew Services
```
brew tap homebrew/services
```

Add MongoDB to brew services list to start on boot
```
sudo brew services start mongodb
````

Verify it started:
```
brew services list
```

Grab the OSX Files from Polyglot-v2's github repo
```
mkdir ~/polyglot
cd ~/polyglot
wget https://github.com/Einstein42/udi-polyglotv2/raw/master/binaries/curl https://github.com/Einstein42/udi-polyglotv2/raw/master/binaries/polyglot-v2-osx-x64.tar.gz
tar zxf polyglot-v2-osx-x64.tar.gz

wget https://raw.githubusercontent.com/Einstein42/udi-polyglotv2/master/scripts/com.universal-devices.polyglot.plist
sudo cp com.universal-devices.polyglot.plist /Library/LaunchDaemon
sudo launchctl load com.universal-devices.polyglot
```

Go to https://localhost:3000
