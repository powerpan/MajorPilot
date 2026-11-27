#!/bin/bash
# Contact sheet: top <cssH> px of several shots side by side. Usage: tools/sheet.sh out.png cssH file...
out=$1; ch=$2; shift 2; f=""; ins=""; i=0; args=()
for x in "$@"; do
  IFS=, read W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$x")
  if [ "$W" -gt 2000 ]; then s=2; else s=3; fi; cw=$((W / s)); hh=$((ch * s)); [ $hh -gt $H ] && hh=$H
  ph=$(( ch * 600 / cw + 2 ))
  f="$f[$i:v]crop=$W:$hh:0:0,scale=600:-2,pad=620:$ph:10:0:color=0x777777[c$i];"; ins="$ins[c$i]"; i=$((i+1)); args+=(-i "$x")
done
ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${ins}hstack=inputs=$i" "$out"
