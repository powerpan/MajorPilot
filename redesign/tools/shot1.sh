#!/bin/bash
# helper for sweep.sh: one "out|url|width" job
IFS="|" read -r o u w <<< "$1"
r=$(node "$(dirname "$0")/shot.mjs" "$o" "$u" "$w" 2>&1)
echo "$r" | grep -q "no page errors" || { echo "== $o  ($u @ $w)"; echo "$r" | grep -v "^saved"; }
