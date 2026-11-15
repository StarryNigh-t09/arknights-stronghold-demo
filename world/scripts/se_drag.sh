#!/bin/bash
# se_drag.sh x1 y1 x2 y2  —— 用 sendevent 直接写 /dev/input/event4，坐标是横屏 1920x1080
export MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1
ADB="/c/Program Files/Netease/MuMu/nx_main/adb.exe"
D="-s 127.0.0.1:16416"
DEV=/dev/input/event4
X1=$1; Y1=$2; X2=$3; Y2=$4
STEPS=${5:-40}
PX1=$((1080-Y1)); PY1=$X1
PX2=$((1080-Y2)); PY2=$X2
CMD="sendevent $DEV 3 47 0; sendevent $DEV 3 57 1; sendevent $DEV 3 53 $PX1; sendevent $DEV 3 54 $PY1; sendevent $DEV 0 0 0; "
i=1
while [ $i -le $STEPS ]; do
  PX=$(( PX1 + (PX2-PX1)*i/STEPS ))
  PY=$(( PY1 + (PY2-PY1)*i/STEPS ))
  CMD="$CMD sendevent $DEV 3 53 $PX; sendevent $DEV 3 54 $PY; sendevent $DEV 0 0 0; "
  i=$((i+1))
done
CMD="$CMD sendevent $DEV 3 57 -1; sendevent $DEV 0 0 0"
"$ADB" $D shell "$CMD"
