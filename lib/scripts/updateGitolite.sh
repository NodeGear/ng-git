#!/bin/bash

# $1 Gitolite location
cd $1
git status
git add --all
git commit -m "`date`"
git push origin master