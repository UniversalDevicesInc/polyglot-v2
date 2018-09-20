## PKG Build Source Binary

Only needed if we don't have one in the pkg-fetch repo
Example for Version 9.2.1

#### Get NodeJS Sources

wget https://nodejs.org/download/release/v9.2.1/node-v9.2.1.tar.gz
tar -zxvf node-v9.2.1.tar.gz

#### Patch NodeJS Sources with PKG modifications

cd node-v9.2.1
wget https://github.com/zeit/pkg-fetch/raw/master/patches/node.v9.2.1.cpp.patch
git apply node.v9.2.1.cpp.patch

#### Build NodeJS

./configure
make -j4

take a nap, this will take 5+ hours

#### Copy binary to pkg's cache for use in builds
cp node ~/.pkg-cache/v2.5/fetched-v9.2.1-linux-armv6


#### FreeBSD
sudo pkg install gmake llvm60 www/node www/npm
export CC=clang CXX=clang++
wget https://nodejs.org/download/release/v9.2.1/node-v9.2.1.tar.gz
tar -zxvf node-v9.2.1.tar.gz 
cd node-v9.2.1
wget https://github.com/zeit/pkg-fetch/raw/master/patches/node.v9.2.1.cpp.patch
git apply node.v9.2.1.cpp.patch
./configure
make -j4
cp node ~/.pkg-cache/v2.5/fetched-v9.2.1-freebsd-x64
sudo npm install nodemon pkg@4.3.1 -g
