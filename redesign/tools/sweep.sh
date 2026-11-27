#!/bin/bash
# Screenshot every route in fresh + sample, en 1440 / zh 1440 / en 390. Usage: tools/sweep.sh [outdir] [filter-regex]
cd "$(dirname "$0")/.."
OUT=${1:-shots/sweep}; FILTER=${2:-.}; mkdir -p "$OUT"
ROUTES="home explore dashboard brief compare school"
for l in ba:ratio,funnel,missing,test,memo ds:claim,trend,split,conclude,summary ai:numbers,errors,change,tradeoff,note; do
  id=${l%%:*}; for s in $(echo ${l#*:} | tr , ' ') reflect done; do ROUTES="$ROUTES lens/$id/$s"; done
done
jobs_list=()
for r in $ROUTES; do for p in fresh sample; do for v in "en 1440" "zh 1440" "en 390"; do
  set -- $v; name="$(echo $r | tr / -)_${p}_$1_$2"
  echo "$name" | grep -qE "$FILTER" || continue
  q="/?preset=$p"; [ "$1" = zh ] && q="$q&lang=zh"
  jobs_list+=("$OUT/$name.png|$q#/$r|$2")
done; done; done
printf '%s\n' "${jobs_list[@]}" | xargs -P 6 -n 1 tools/shot1.sh
echo "sweep done: ${#jobs_list[@]} shots"
