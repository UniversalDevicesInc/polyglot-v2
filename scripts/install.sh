#!/bin/bash

SUDO=''
if [ $EUID != 0 ]; then
    SUDO='sudo'
fi

echo "########################################################################################"
echo "Staring Polyglot Install ......"
echo "Updating System and installing MongoDB, git, python3, curl and relevant dependencies"
$SUDO apt-get -qy update
$SUDO apt-get -qqy install mongodb-server git python3-pip python3-dev curl
echo "########################################################################################"
echo "Moving to polyglot directory ......"
[ ! -d polyglot ] && mkdir polyglot
cd polyglot

echo "########################################################################################"
armVer=$(lscpu | head -1 | awk '{print $2}')
if [ "$armVer" = "armv6l" ]; then
  file_string="polyglot-v2-linux-armv6"
elif [ "$armVer" = "armv7l" ]; then
  file_string="polyglot-v2-linux-armv7"
else
  file_string="polyglot-v2-linux-x64"
fi
echo "CPU Type is $armVer"
echo "Removing existing version of polyglot"
[ -f $file_string.tar.gz ] && rm $file_string.tar.gz
[ -f $file_string ] && rm $file_string
echo "Getting $file_string from GitHub"
wget -q https://github.com/Einstein42/udi-polyglotv2/raw/master/binaries/$file_string.tar.gz
echo "Extracting $file_string.tar.gz..."
tar -zxf $file_string.tar.gz
echo "Complete..."
echo "Retrieving Systemd startup scripts from GitHub"
wget -q https://github.com/Einstein42/udi-polyglotv2/raw/master/scripts/polyglot-v2.service
sed -i "s|<PWD>|$(pwd)|g;s|<USER>|$(whoami)|g;s|<FILE>|$(realpath $file_string)|g" polyglot-v2.service
[ -f /lib/systemd/system/polyglot-v2.service ] && $SUDO systemctl stop polyglot-v2
$SUDO mv -f polyglot-v2.service /lib/systemd/system/
$SUDO systemctl daemon-reload
$SUDO systemctl enable polyglot-v2.service
$SUDO systemctl start polyglot-v2.service

cd ..
hostip=$(hostname -I | awk '{print $1}')
hostport="3000"
echo "###################################################################################"
echo "DONE! Login to Polyglot v2 at http://$hostip:$hostport"
echo "Username: admin"
echo "Password: admin"
