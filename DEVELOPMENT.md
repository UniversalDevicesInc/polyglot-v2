### Setup development environment

##### Add support for multi-arch
* sudo dpkg --add-architecture i386
* sudo apt-get install -y libc6:i386 libstdc++6:i386 gcc-8-base:i386 libgcc1:i386

##### Install NodeJS 8.x
* curl -sL https://deb.nodesource.com/setup_8.x | sudo bash -
* sudo apt-get install -y nodejs

##### Clone the Polyglot-v2 repository
* git clone git@github.com:Einstein42/udi-polyglotv2.git
* cd udi-polyglotv2

##### Install NodeJS Packages
* npm install
* sudo npm install pkg nodemon -g

##### Run Polyglot
* npm run start:dev
