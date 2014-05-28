NodeGear
=========

`ng-git` is a standalone node application attached to `Redis`, listening for notifications regarding SSH Keys.

This app is to be tightly integrated with gitolite, the git manager. It:

- Manages SSH Keys in gitolite
- Generates SSH Keys and saves to the database
- Pushes to gitolite admin