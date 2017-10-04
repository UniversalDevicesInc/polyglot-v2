#!/bin/bash

SUDO=''
if [ $EUID != 0 ]; then
    SUDO='sudo'
fi


############ NODE JS
if command -v node &>/dev/null; then
	echo "Node Already installed. Version `node --version` Make sure it's at least v6.11.0"
else
	armVer=`lscpu | head -1 | awk '{print $2}'`

	if [ "$armVer" = "armv6l" ]; then
		node_string="node-v6.11.0-linux-armv6l.tar.xz"
	elif [ "$armVer" = "armv7l" ]; then
		node_string="node-v6.11.0-linux-armv7l.tar.xz"
	else
		node_string="node-v6.11.0-linux-arm64.tar.xz"
	fi

	mkdir .install
	cd .install
	wget "https://nodejs.org/dist/v6.11.0/$node_string"
	tar -xf $node_string
	dir=`ls -l . | egrep '^d' | awk '{print $9}'`
	cd $dir
	find . -maxdepth 1 -type f -delete
	$SUDO cp -R * /usr/local/

	cd ../../
	rm -Rf .install

	version=`node -v`
	echo "Installed Node Version $version"
fi

############ MONGODB and MOSQUITTO
wget http://repo.mosquitto.org/debian/mosquitto-repo.gpg.key
$SUDO apt-key add mosquitto-repo.gpg.key
rm mosquitto-repo.gpg.key
$SUDO wget http://repo.mosquitto.org/debian/mosquitto-stretch.list -P /etc/apt/sources.list.d/
$SUDO apt-get update -qy
$SUDO apt-get install mongodb-server mosquitto python3 python3-dev python3-pip -qy
$SUDO wget https://github.com/Einstein42/udi-polyglotv2/raw/master/scripts/mosquitto.conf -O /etc/mosquitto/conf.d/local.conf
$SUDO systemctl restart mosquitto
$SUDO pip3 install -U pip
wget https://github.com/Einstein42/udi-polyglotv2/raw/master/scripts/user.json
mongoimport --host localhost --db polyglot --collection users --type json --file ./user.json
rm user.json
# Websockets3 if necessary.
# http://ftp.us.debian.org/debian/pool/main/libw/libwebsockets/libwebsockets3_1.2.2-1_armhf.deb

############ Polyglot v2 dot env
[ ! -d ~/.polyglot ] && mkdir -p ~/.polyglot/log
[ -f ~/.polyglot/.env ] && rm ~/.polyglot/.env

echo "# Polyglot v2 and NodeServer Environment Variables" > ~/.polyglot.env
hostip=`hostname -I | awk '{print $1}'`
echo "HOST_IP = $hostip" >> ~/.polyglot/.env

echo "Enter port to Listen on for Polyglot: [8080]"
read hostport
if [ "$hostport" = "" ]; then
        hostport="8080"
fi
echo "Enter ISY Hostname/IP:"
read isyhost
echo "Enter ISY Port: [80]"
read isyport
if [ "$isyport" = "" ]; then
        isyport=80
fi
echo "Enter ISY Username [admin]"
read isyusername
if [ "$isyusername" = "" ]; then
        isyusername="admin"
fi
echo "Enter ISY Password:"
read isypassword

echo "HOST_PORT = $hostport" >> ~/.polyglot/.env
echo "ISY_HOST = $isyhost" >> ~/.polyglot/.env
echo "ISY_PORT = $isyport" >> ~/.polyglot/.env
echo "ISY_USERNAME = $isyusername" >> ~/.polyglot/.env
echo "ISY_PASSWORD = $isypassword" >> ~/.polyglot/.env
echo "MQTT_HOST = `hostname -I | awk '{print $1}'`" >> ~/.polyglot/.env
wget https://github.com/Einstein42/udi-polyglotv2/raw/master/scripts/dot.env
cat dot.env >> ~/.polyglot/.env
rm dot.env
chmod 600 ~/.polyglot/.env

############ Polyglot v2
echo "This will take a while especially on a Raspberry Pi 1 or 2.... go make a cup of coffee."
$SUDO npm install -g polyglot-v2

############ Install Start-Up script
echo "Installing Polyglot v2 To Start on Boot"
wget https://github.com/Einstein42/udi-polyglotv2/raw/master/scripts/polyglot-v2.service
$SUDO mv ./polyglot-v2.service /lib/systemd/system/
$SUDO systemctl enable polyglot-v2
$SUDO systemctl start polyglot-v2

echo "###################################################################################"
echo "DONE! Login to Polyglot v2 at http://$hostip:$hostport"
echo "Username: admin"
echo "Password: admin"
