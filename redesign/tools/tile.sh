#!/bin/bash
# Re-lay a tall screenshot as N side-by-side columns (easier to review). Usage: tools/tile.sh in.png out.png [cols=4] [outWidth=2400]
in=$1; out=$2; n=${3:-4}; ow=${4:-2400}
IFS=, read W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$in")
seg=$(( (H + n - 1) / n )); f=""; ins=""
for i in $(seq 0 $((n-1))); do y=$((i*seg)); hh=$seg; [ $((y+hh)) -gt $H ] && hh=$((H-y));
  f="$f[0:v]crop=$W:$hh:0:$y,pad=$((W+40)):$seg:20:0:color=0x888888[c$i];"; ins="$ins[c$i]"; done
ffmpeg -v error -y -i "$in" -filter_complex "${f}${ins}hstack=inputs=$n,scale=$ow:-1" "$out"
