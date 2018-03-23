#!/usr/bin/env bash

SUDO=''
if [ $EUID != 0 ]; then
    SUDO='sudo'
fi

echo "########################################################################################"
echo "Upgrading polyinterfaces ......"
echo "Start Python2"
if [ -x "$(command -v pip)" ]; then
  pip install --upgrade --user polyinterface
fi
echo "End Python2"
echo "Start Python3"
if [ -x "$(command -v pip3)" ]; then
  pip3 install --upgrade --user polyinterface
fi
echo "End Python3"
echo "Completed!"
echo "########################################################################################"
