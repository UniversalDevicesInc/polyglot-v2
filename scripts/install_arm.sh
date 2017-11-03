#!/bin/bash

SUDO=''
if [ $EUID != 0 ]; then
    SUDO='sudo'
fi

$SUDO apt-get update -qy
$SUDO apt-get install mongodb-server git python3-pip -qy
mkdir polyglot
cd polyglot
wget https://github.com/Einstein42/udi-polyglotv2/raw/master/binaries/polyglot-v2-linux-armv7.tar.gz
tar -zxf polyglot-v2-linux-armv7.tar.gz
dir=$(pwd)
user=$(whoami)
wget https://github.com/Einstein42/udi-polyglotv2/raw/master/scripts/polyglot-v2.service
sed 's/<PWD>/$dir/g' polyglot-v2.service
$SUDO mv
