## PKG Build Source Binary

Only needed if we don't have one in the pkg-fetch repo
Example for Version 8.9.0

#### Get NodeJS Sources

wget https://nodejs.org/download/release/v8.9.0/node-v8.9.0.tar.gz
tar -zxvf node-v8.9.0.tar.gz

#### Patch NodeJS Sources with PKG modifications

cd node-v8.9.0
wget https://github.com/zeit/pkg-fetch/raw/master/patches/node.v8.9.0.cpp.patch
git apply node.v8.9.0.cpp.patch

#### Build NodeJS

./configure
make -j4

take a nap, this will take 5+ hours

#### Copy binary to pkg's cache for use in builds
cp node ~/.pkg-cache/v2.5/fetched-v8.9.0-linux-armv6
