#!/bin/bash

SUDO=''
if [ $EUID != 0 ]; then
    SUDO='sudo'
fi

$SUDO apt-get update -qy
$SUDO apt-get install mongodb-server git python3-pip -qy
mkdir polyglot
cd polyglot

armVer=`lscpu | head -1 | awk '{print $2}'`
if [ "$armVer" = "armv6l" ]; then
  file_string="polyglot-v2-linux-armv6"
elif [ "$armVer" = "armv7l" ]; then
  file_string="polyglot-v2-linux-armv7"
else
  file_string="polyglot-v2-linux-x64"
fi

wget https://github.com/Einstein42/udi-polyglotv2/raw/master/binaries/$file_string.tar.gz
tar -zxf $file_string.tar.gz
user=$(whoami)
wget https://github.com/Einstein42/udi-polyglotv2/raw/master/scripts/polyglot-v2.service
sed "s|<PWD>|$(pwd)|g;s|<USER>|$(whoami)|g;s|<FILE>|$(realpath $file_string)|g" polyglot-v2.service
