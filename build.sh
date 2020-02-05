#!/bin/sh

if [ -e lambda.zip ]; then
   rm lambda.zip
fi

if [ -e node_modules ]; then
   rm -rf node_modules
fi

if [ -e dist ]; then
   rm -rf dist
fi
npm install
npx tsc
rm -rf node_modules
npm install --production
rm -rf dist/src/cli
cd dist/src
zip ../../lambda.zip -r *
cd ../..
zip lambda.zip -r node_modules/
npm install
