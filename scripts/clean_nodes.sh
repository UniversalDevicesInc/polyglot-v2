#!/bin/bash

mongo polyglot --eval "db.nodes.remove({'profileNum':'$1'})"
