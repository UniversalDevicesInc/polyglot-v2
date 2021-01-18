# UDI Polyglot v2

[![Build Status](https://travis-ci.org/UniversalDevicesInc/polyglot-v2.svg?branch=master)](https://travis-ci.org/UniversalDevicesInc/polyglot-v2)

Polyglot is a Middleware between the [Universal Devices ISY Home Automation device](http://www.universal-devices.com/) and any number of external devices and services. 

Requirements: Network Module or ISY Portal (which includes the Network Module)

Requirements: Network Module or ISY Portal (which includes the Network Module)

Polyglot v2 is built on the [MEAN](http://mean.io/) stack which is a production ready enterprise level code stack that includes:

- MongoDB (A NoSQL database engine that stores data in JSON formated 'documents')
- Express (NodeJS HTTP API server module)
- Angular.JS (Frontend framework developed by Google)
- NodeJS (Fully asynchronous server side version of Javascript)

Using these tools, along with the [MQTT](http://mqtt.org/) messaging protocol, we have created a robust IoT powerhouse that can speak to any and every device available with open API standards using simple, straight-forward modules (NodeServers).

While most of the previous code had been written in Python, the event loop driven Node.JS was chosen for this platform due to its asynchronous nature. Python or ANY language can still be used to develop a NodeServer with the standard API interface available.

## Installation instructions

The steps are outlined directly for the Raspberry Pi, specifically the 3 or 3b models which were used to test. This has also worked on the original Raspberry Pi (Armv6) as well. A pre-built script is [here](https://raw.githubusercontent.com/UniversalDevicesInc/polyglot-v2/master/scripts/install.sh) to do all the heavy lifting for you. This install procedure was tested using a clean install of [Rasbian Stretch Lite](https://www.raspberrypi.org/downloads/raspbian/). Version **September 2017** at time of writing.

To Install Using the script (This will do EVERYTHING for you):

```bash
# Run the Install Script
wget -qO - https://raw.githubusercontent.com/UniversalDevicesInc/polyglot-v2/master/scripts/install.sh | bash -e

```

You do NOT need to proceed with theses instructions if you ran the script above. This is all done for you.

The manual steps are listed here as well.

Steps overview:

- Install MongoDB
- Install Polyglot-v2

### Prerequisites

[MongoDB](https://www.mongodb.com/)

```bash
# Update your sources
sudo apt-get update -qy

# Install the MongoDB Server / git / Python3 / Curl
sudo apt-get -qqy install mongodb-server git python3-pip python3-dev curl

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

### Polyglot

Now the good stuff. Let's install Polyglot! Login as the user that is going to run Polyglot (pi or whatever you choose). Polyglot does NOT need to be run as root! (PLEASE DO NOT RUN POLYGLOT AS ROOT)

```bash
# Create a polyglot directory
mkdir polyglot

# Enter polyglot directory
cd polyglot

# Get the Polyglot binary. This example is for armv7 Raspberry Pi 3/3b. (armv6 is RPi 1/Nano and x64 is most x86 linux boxes)
# If you don't know which one to get run the command 'lscpu' and look at the top line. 'Architecture'
wget -q https://s3.amazonaws.com/polyglotv2/binaries/polyglot-v2-linux-armv7.tar.gz

# Extract the archive
tar -zxf polyglot-v2-linux-armv7.tar.gz

# Run Polyglot normally:
./polyglot-v2-linux-armv7

# OR

# Run Polyglot with debug logging turned on:
NODE_ENV=development ./polyglot-v2-linux-armv7
```

To start Polyglot on Boot do the following:

```bash
# Get base systemd script from the GitHub repository
wget -q https://raw.githubusercontent.com/UniversalDevicesInc/polyglot-v2/master/scripts/polyglot-v2.service

# Edit it for your system
nano polyglot-v2.service

# Modify the following sections in the polyglot-v2.service file
# Replace <PWD> with the current directory that the polyglot binary resides in.
# Replace <USER> with the user you want polyglot to run as
# Replace <FILE> with the FULL path to the polyglot binary. e.g. /home/pi/polyglot/polyglot-v2-linux-armv7

# One the above changes are done to the polyglot-v2.service file, move it to the systemd unit folder
sudo mv polyglot-v2.service /lib/systemd/system/

# Add the service then start polyglot-v2
sudo systemctl enable polyglot-v2
sudo systemctl start polyglot-v2
```

Verify that Polyglot is running

```bash
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

Default username and password are both `admin`

Logs are located at `~/.polyglot/log/debug.log` or you can use the frontend web interface to watch them in real-time.

```bash
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

#### Enable debug logging for Polyglot

```bash
# Edit the ~/.polyglot/.env file
nano ~/.polyglot/.env

# Add or modify the NODE_ENV variable
NODE_ENV=development

```

#### Configuration Overrides for Polyglot

These configuration overrides are available in the ~/.polyglot/.env file. It is not required so you may have to create it. Most of them can be updated via the web interface and are all saved to the database, so these are typically not required unless you have a specific reason. These WILL override existing database settings, even if you change them and save in the frontend. Remember these are OVERRIDES.

```bash
# Overrides the IP address Polyglot listens on the local machine.
BIND_IP='192.168.1.2'

# Overrides the IP address Polyglot sends to ISY to accept commands
HOST_IP='192.168.1.2'

# Overrides the Port that Polyglot listens on for its frontend interface.
HOST_PORT='3000'

# Overrides the default mode of HTTPS
USE_HTTPS=false

# Username used to login to the ISY.
ISY_USERNAME='admin'

# Password used to login to the ISY. Careful this is clear text, I wouldn't recommend setting this here.
ISY_PASSWORD='password'

# ISY IP address. This is automatically discovered on the initial run of Polyglot if you are on the same network. If you have multiple you can update it on the settings page of the frontend, or override it here.
ISY_HOST='192.168.1.10'

# ISY Port
ISY_PORT='80'

# ISY HTTPS: True/False This isn't fully tested so beware HTTPS at the moment.
ISY_HTTPS=false

# MQTT Host is the IP address of the host running a MQTT server. This is built in to Polyglot so you won't need this unless you'd prefer an external MQTT server.
MQTT_HOST='127.0.0.1'

# MQTT Port is the port used to connect to the MQTT server. Default is 1883
MQTT_PORT='1883'

# URI to access MongoDB. You might need this if you have an off-box Mongo instance.
MONGO_URI='mongodb://localhost:27017/'

# To enable debug logging set the NODE_ENV override to 'development'
NODE_ENV='development'

# To enable Custom SSL Certificates
CUSTOM_SSL=true

# Enable Beta Software Updates
USE_BETA=true
```

#### Custom SSL Certificates for Polyglot

If you want to use your own SSL certificates instead of the self-signed certificates that Polyglot auto generates for you, then place the certificates in the ~/.polyglot/ssl/custom/ folder. There should be three files present as outlined below. The custom.key file is read then encrypted in the database, the other two are simply read and stored since they are public certs. If the CUSTOM_SSL .env override is set to true, polyglot attempts to read the following files:

- custom.key: this is your private key file
- custom.crt: this is your public cert file
- custom.ca: this file can contain multiple ca certificates, otherwise known as the trust chain, this file will have any intermediate and root certificates

Polyglot will attempt to read these files on startup EVERY TIME that CUSTOM_SSL is enabled. If you allow Polyglot to read the files once, you can then delete the custom files and Polyglot will continue to use the saved values from the database. DO NOT DELETE THE ~/.polyglot/ssl/ client/polyglot certificates, these are used for MQTT encryption and authentication. Polyglot will spit them back out on startup even if you accidentally delete them.

#### SSL Error 'ee key too small'

I've had several linux users run into the error 'ee key too small' when trying to start Polyglot.

`sudo nano /etc/ssl/openssl.cnf`

Change the line:

```bash
CipherString = DEFAULT@SECLEVEL=2
to
CipherString = DEFAULT@SECLEVEL=1
```

### Backup and Restore

As of version 2.2.4+ you can now backup and restore your NodeServers and Nodes on to a different installation of Polyglot.
Click on Settings > Settings and you will find a "Backup and Restore" section.

Backup will download a .bin file to your machine that is an encrypted copy of all installed NodeServers and Nodes. This does NOT include any other settings like ISY connection settings (on purpose). So if you intend to migrate to a new installation of Polyglot here are the steps:

- Download backup from existing installation
- Install and configure ISY connection settings of new installation of Polyglot
- Restore backup

To Restore the backup, click the "Select File" button on the "Backup and Restore" section of the settings menu. Once you select the file, you will see that same button change to "Restore". Once you hover over that button you will see the selected filename that you chose to restore. Click the "Restore" button to initiate the restore process. This does the following:

- Decrypts and validates the file
- Individiually iterates through the backed up NodeServers doin the following:
  - Verifies a NodeServer is not currently running and active on that slot (shuts it down for overwrite if there is)
  - Overwrites or Creates the NodeServer database entry
  - Overwrites or Creates any Nodes in the database associate with that NodeServer
  - Overwrites or Creates the slot configuration on the ISY for that NodeServer (this includes updating the existing ISY configuration for that NodeServer to the new IP address of Polyglot, **WITHOUT** removing nodes and re-creating them, thus saving your existing programs.)
  - Downloads or Pulls the latest code for that NodeServer automatically
  - Installs the profile to the ISY from that freshly downloaded NodeServer code

Once all NodeServers have had the previous steps completed, it will automatically shut down Polyglot. If you have systemctl set up properly (as you should), Polyglot will automatically restart and everything should be working appropriately with no further interaction necessary.

### Development Documentation

First check the [Wiki](https://github.com/UniversalDevicesInc/polyglot-v2/wiki/Creating-a-NodeServer) for how to build a NodeServer.

It is pre-built in the docs folder [Found Here](https://github.com/UniversalDevicesInc/polyglot-v2) on GitHub in HTML format if you clone the repository or available in the
[Online Documentation Found Here](https://doclets.io/Einstein42/udi-polyglotv2/master/overview).

Python3 interface API for building NodeServers is [here](https://github.com/UniversalDevicesInc/polyglot-v2-python-interface).

NodeJS interface API for building NodeServers is [here](https://github.com/UniversalDevicesInc/pgc-nodejs-interface).
