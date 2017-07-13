# UDI Polyglot v2

Polyglot is a Middleware between the [Universal Devices ISY Home Automation device](http://www.universal-devices.com/) and any number of external devices and services.

Polyglot v2 is built on the [MEAN](http://mean.io/) stack which is a production ready enterprise level code stack that includes:
 - MongoDB (A NoSQL database engine that stores data in JSON formated 'documents')
 - Express (NodeJS HTTP API server module)
 - Angular.JS (Frontend framework developed by Google)
 - NodeJS (Fully asynchronous server side version of Javascript)

Using these tools, along with the [MQTT](http://mqtt.org/) messaging protocol, we have created a robust IoT powerhouse that can speak to any and every device available with open API standards using simple, straight-forward modules (NodeServers).

While most of the previous code had been written in Python, the event loop driven Node.JS was chosen for this platform due to its asynchronous nature. Python or ANY language can still be used to develop a NodeServer with the standard API interface available.

This Polyglot below documentation is meant to be used in order to help others to understand the code and continue the development from a community perspective.


### Installation instructions

Since Polyglot is an enterprise level application there are several steps to get it up and running, this will be an ongoing process in order to simplify it. These steps are outlined directly for the Raspberry Pi, specifically the 3 or 3b models which were used to test. This has also worked on the original Raspberry Pi (Armv6) as well. A pre-built script is [here](google.com) to do all the heavy lifting for you. This install procedure was tested using a clean install of [Rasbian Jessie Lite](https://www.raspberrypi.org/downloads/raspbian/). Version **July 2017** at time of writing.

If you don't use Raspbian or a Debian derivative the manual steps are listed here as well.

Steps overview:
 - Install Node.JS LTS (Stable Release)
 - Install MongoDB
 - Install Mosquitto (MQTT Broker)
 - Install Polyglot-v2

##### Prerequisites

[Node.JS](https://nodejs.org/en/download/)  
```
# Get the NodeJS package (Rasbian Jessie currently has a old version in their package repository)
wget "https://nodejs.org/dist/v6.11.1/node-v6.11.1-linux-armv7l.tar.xz"

# Unpack the binary
tar -xf node-v6.11.1-linux-armv7l.tar.xz

# Enter the package directory
cd node-v6.11.1-linux-armv7l

# Remove any un-needed files from the package
find . -maxdepth 1 -type f -delete

# Install Node.JS to recommended location
sudo cp -R * /usr/local/

# Back out of the NodeJS Package directory
cd ..

# Remove the Package folder
rm -Rf node-v6.11.1-linux-armv7l
```

To verify issue the command  `node -v` and you should see version **v6.11.0** or higher. If you see version 0.10.\*, then you have an old version and need to try the steps again.

[MongoDB](https://www.mongodb.com/) and [Mosquitto](http://mosquitto.org/download/)

```
# Get the Mosquito Debian Repository GPG Key
wget http://repo.mosquitto.org/debian/mosquitto-repo.gpg.key

# Install the Mosquitto GPG Key to Apt
sudo apt-key add mosquitto-repo.gpg.key

# Get the Mosquitto Repository entry
sudo wget http://repo.mosquitto.org/debian/mosquitto-jessie.list -P /etc/apt/sources.list.d/

# Update your sources to get the Mosquitto repository you just Installed
sudo apt-get update -qy

# Install the MongoDB Server / Mosquitto / Python3 and Python3-dev
sudo apt-get install mongodb-server mosquitto python3 python3-dev python3-pip -qy

# Add Polyglot Specific configuration to Mosquitto
sudo nano /etc/mosquitto/conf.d/local.conf

# Paste in the following lines:
connection_messages true
log_timestamp true
listener 1883
listener 8083
protocol websockets
# Save and Exit

# Restart Mosquitto to enable the changes
sudo systemctl restart mosquitto

# Upgrade Python3 PIP (Needed later)
sudo pip3 install -U pip

# Create MongoDB Seed File (default user for Polyglot)
echo '{"username": "admin","password": "$2a$10$rhI5QUbz/fsMXEFNMxy.senzW8c2nLvd.JmK1HnJZrhviUBRtKTeC"}' > seed.json

# Import Seed file to MongoDB
mongoimport --host localhost --db polyglot --collection users --type json --file ./seed.json
```

At this point lets just make sure all the pre-requisites are good to go:
```
# Check Node version
node -v

v6.11.1
```

```
# Check Mosquitto Status
systemctl status mosquitto

● mosquitto.service - Mosquitto MQTT Broker
   Loaded: loaded (/lib/systemd/system/mosquitto.service; disabled)
   Active: active (running) since Thu 2017-07-13 03:40:45 UTC; 20min ago
     Docs: man:mosquitto(8)
           https://mosquitto.org/
 Main PID: 857 (mosquitto)
   CGroup: /system.slice/mosquitto.service
           └─857 /usr/sbin/mosquitto -c /etc/mosquitto/mosquitto.conf
```

```
# Check MongoDB Status
systemctl status mongodb

● mongodb.service - An object/document-oriented database
   Loaded: loaded (/lib/systemd/system/mongodb.service; enabled)
   Active: active (running) since Thu 2017-07-13 03:35:41 UTC; 25min ago
     Docs: man:mongod(1)
 Main PID: 431 (mongod)
   CGroup: /system.slice/mongodb.service
           └─431 /usr/bin/mongod --config /etc/mongodb.conf
```

##### Polyglot

Now the good stuff. Let's install Polyglot! Login as the user that is going to run Polyglot (pi or whatever you choose). Polyglot does NOT need to be run as root! (PLEASE DO NOT RUN POLYGLOT AS ROOT)

```
# Make Polyglot log and configuration directories.
mkdir -p ~/.polyglot/log

# Create Polyglot Config File
nano ~/.polyglot/.env

# Change HOST_IP to the ip address Polyglot will serve from
# Change HOST_PORT to the port you want Polyglot to listen on
# Change MQTT_HOST to the MQTT Broker IP address (Usually the same as the HOST_IP, however doesn't have to be)
# Change ISY_HOST to the ISY address
# Change ISY_USERNAME and ISY_PASSWORD the their respective values
# Everything else should be fine to leave as the default.
# Then paste in the following to the file.
HOST_IP = 192.168.1.25
HOST_PORT = 3000
ISY_HOST = 192.168.1.20
ISY_PORT = 80
ISY_USERNAME = admin
ISY_PASSWORD = password
MQTT_HOST = 192.168.1.25
MQTT_PORT = 1883
MQTT_WSPORT = 8083
# ISY_HTTPS = false
MONGO_URI = 'mongodb://localhost:27017/polyglot'
SECRET = 'udi-polyglot'
NODE_ENV = production
# End of Paste

# Change the permissions of the Polyglot config file so that only this user account can read it since it does have the ISY password in it.
chmod 600 ~/.polyglot/.env

# Install Polyglot via NPM (This will take a bit)
sudo npm install -g polyglot-v2
```

To start Polyglot on Boot do the following:
```
# Create the service file
sudo nano /lib/systemd/system/polyglot-v2.service

#Paste in the following
#Edit the User to be the user you want to run Polyglot
[Unit]
Description=polyglot-v2
After=network-online.target mongodb.service

[Service]
Type=simple
WorkingDirectory=~/.polyglot/
ExecStart=/usr/local/bin/polyglot-v2
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
# End Paste

# Enable the service file
sudo systemctl enable polyglot-v2

# Start Polyglot v2!
sudo systemctl start polyglot-v2
```

Verify that Polyglot is running
```
# Check Polyglot status
sudo systemctl status polyglot-v2.service

● polyglot-v2.service - polyglot-v2
   Loaded: loaded (/lib/systemd/system/polyglot-v2.service; enabled)
   Active: active (running) since Thu 2017-07-13 04:38:53 UTC; 10min ago
 Main PID: 1647 (node)
   CGroup: /system.slice/polyglot-v2.service
           └─1647 node /usr/local/bin/polyglot-v2

Jul 13 04:38:53 raspberrypi systemd[1]: Started polyglot-v2.
```

Logs are located at `~/.polyglot/log/debug.log`
```
# Watch the logs real-time
tail -f ~/.polyglot/log/debug.log

7/13/2017, 4:24:15 AM - info: Starting Polyglot version 2.0
7/13/2017, 4:24:15 AM - info: MongoDB: Connected
7/13/2017, 4:24:16 AM - info: MQTT Services Started.
7/13/2017, 4:24:16 AM - info: Secure Server started on port 3000
7/13/2017, 4:24:16 AM - info: ISY: Got Version 5.0.10
7/13/2017, 4:24:16 AM - info: MQTT: Subscribe Successful udi/polyglot/connections/# QoS: 0
7/13/2017, 4:24:38 AM - info: Successful login by admin
7/13/2017, 4:24:39 AM - info: MQTT: Frontend Websockets interface  Connected.
```

### Development Documentation

It is pre-built in the docs folder [Found Here](https://github.com/Einstein42/udi-polyglotv2) on GitHub in HTML format if you clone the repository or available in the
[Online Documentation Found Here](https://doclets.io/Einstein42/udi-polyglotv2/master/overview).
