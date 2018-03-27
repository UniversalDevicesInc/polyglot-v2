### Setup development environment

##### Install NodeJS 9.x
* curl -sL https://deb.nodesource.com/setup_9.x | sudo bash -
* sudo apt-get install -y nodejs

##### Manual NodeJS install
* wget https://nodejs.org/download/release/v9.2.0/node-v9.2.0-linux-armv6l.tar.gz
* sudo tar -xf node-v9.2.0-linux-armv6l.tar.gz --directory /usr/local --strip-components 1

##### Clone the Polyglot-v2 repository
* git clone https://github.com/UniversalDevicesInc/polyglot-v2.git
* cd polyglotv2

##### Install NodeJS Packages
* npm install
* sudo npm install pkg nodemon -g

##### Run Polyglot
* npm run start:dev
