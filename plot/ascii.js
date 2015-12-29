'use strict';

var quantile = require('simple-statistics/src/quantile');
var mean = require('simple-statistics/src/mean');
var min = require('simple-statistics/src/min');
var max = require('simple-statistics/src/max');
var numericSort = require('simple-statistics/src/numeric_sort');
var chunk = require('simple-statistics/src/chunk');

var length = require('ramda/src/length');
var values = require('ramda/src/values');
var keys = require('ramda/src/keys');
var pluck = require('ramda/src/pluck');
var join = require('ramda/src/join');
var merge = require('ramda/src/merge');
var flip = require('ramda/src/flip');
var call = require('ramda/src/call');
var head = require('ramda/src/head');
var last = require('ramda/src/last');

var nest = require('../nest');

var QUANTILES = [0,0.02,0.09,0.25,0.5,0.75,0.91,0.98,1];
var MAXWIDTH = 80;
var DEFAULTS = {
  whiskers: tukeyWhiskers
}

module.exports = function ascii(options,x,y,data){
  var opts = merge(DEFAULTS,options);
 
  var xrecs = nest(x,y)(data)
  var levels = keys(xrecs);
  var maxlength = max(values(xrecs).map(length));
  var xscale = scale([0,maxlength],[5,9]);
  
  var ys = data.map(y);
  var ydomain = [min(ys), max(ys)];
  var yscale = scale(ydomain, [0, MAXWIDTH-1]);
  var yaxis = plotAxis(ydomain, yscale)(zeroArray(' ',MAXWIDTH));
  
  return levels.reduce( function(acc,level){
    var yvals = xrecs[level];
    var canvas = zeroArray(' ', MAXWIDTH * xscale(xrecs[level].length));
    var plot = single(opts, level, canvas, yscale, xrecs[level]); 
    return acc.concat(
      [zeroArray(' ', MAXWIDTH).join('')],
      chunk(plot,MAXWIDTH).map(join(''))
    );
  }, [yaxis.join('')] );

}

function single(options,title,canvas,yscale,dim){

  var qs = quantile(dim, QUANTILES);
  var d_range = range(qs);
  var d_iqr = iqr(qs);
  var d_median = median(qs);
  var d_whiskers = options.whiskers(qs,dim);
  var d_outliers = outliers(d_whiskers,dim);
  var d_mean = mean(dim);
  
  /*
  console.log('qs %o', qs);
  console.log('range %o', d_range);
  console.log('iqr %o', d_iqr);
  console.log('whiskers %o', d_whiskers);
  console.log('outliers %o', d_outliers);
  */
  
  var r_iqr = d_iqr.map(yscale);

  var plotters = [ 
      plotWhiskers( d_whiskers.map(yscale), r_iqr ),
      plotIQR( d_iqr.map(yscale) ),
      plotMedian( yscale(d_median) ),
      plotTextAt( title, r_iqr[0]+1, 0),
      plotTextAt( 'n='+dim.length, r_iqr[0]+1, 1), 
      plotMean( yscale(d_mean) ),
      plotOutliers( numericSort(d_outliers.map(yscale)) )
  ]

  return plotters.reduce( flip(call), canvas);
}

function plotAxis(r,fn){
  var nticks = 10;
  var tickwidth = MAXWIDTH / nticks;
  var valwidth = (r[1] - r[0]) / nticks;

  return function(canvas){
    for (var i=0; i<MAXWIDTH; ++i){
      canvas[i] = '-';
    }
    for (var i=0; i<nticks; ++i){
      plotTextAt('|'+ roundSigFig(r[0]+(i*valwidth),2), Math.floor(i*tickwidth), 0)(canvas)
    }
    return canvas;
  }
}


function plotWhiskers(w,r){
  return function(canvas){
    var lines = Math.floor( canvas.length / MAXWIDTH );
    var midline = Math.floor( lines / 2 );

    canvas[ (midline*MAXWIDTH) + w[0] ] = '|';
    canvas[ (midline*MAXWIDTH) + w[1] ] = '|';
    
    for (var j=w[0]+1; j<r[0]; ++j){
      canvas[ (midline*MAXWIDTH) + j ] = '-';
    }
    for (var j=r[1]+1; j<w[1]; ++j){
      canvas[ (midline*MAXWIDTH) + j ] = '-';
    }

    return canvas;
  }
}

function plotIQR(r){
  return function(canvas){
    var lines = Math.floor( canvas.length / MAXWIDTH );
   
    for (var i=0;i<lines;++i){
      canvas[ (i*MAXWIDTH) + r[0] ] = '|';
      canvas[ (i*MAXWIDTH) + r[1] ] = '|';
      for (var j=r[0]+1; j<r[1]; ++j){
        canvas[ j ] = '¯';
        canvas[ ((lines-1)*MAXWIDTH) + j ] = '_';
      }
    }

    return canvas;
  }
}

function plotTextAt(s,col,line){
  return function(canvas){
    for (var i=0; i<s.length && i<MAXWIDTH; ++i){
      canvas[ (line*MAXWIDTH) + col + i ] = s[i];
    }
    return canvas;
  }
}

function plotMedian(v){
  return function(canvas){
    var lines = Math.floor( canvas.length / MAXWIDTH );
    for (var i=0;i<lines;++i){
      canvas[ (i*MAXWIDTH) + v ] = '|';
    }
    return canvas;
  }
}

function plotMean(v){
  return function(canvas){
    var lines = Math.floor( canvas.length / MAXWIDTH );
    var midline = Math.floor( lines / 2 );
    
    canvas[ (midline*MAXWIDTH) + v ] = 'μ';

    return canvas;
  }
}

// note assumes sorted outliers
function plotOutliers(vs){
  return function(canvas){
    var lines = Math.floor( canvas.length / MAXWIDTH );
    var midline = Math.floor( lines / 2 );
   
    var last, n;
    for (var i=0;i<vs.length;++i){
      if (last == vs[i]){ n++; } else { n=1; }
      canvas[ (midline*MAXWIDTH) + vs[i] ] = (n < 10 ? ''+n : '+');
      last = vs[i];
    }

    return canvas;
  }
}


// extract below this line

function range(qs){
  return [qs[0], qs[qs.length-1]];
}

function median(qs){
  return qs[(qs.length-1)/2];
}

function iqr(qs){
  var mid = (qs.length-1)/2;
  return [qs[mid-1], qs[mid+1]];
}

function outliers(whiskers,dim){
  var below = dim.filter( lt(whiskers[0]) )
    , above = dim.filter( gt(whiskers[1]) );
  return below.concat(above);
}

function tukeyWhiskers(qs,dim){
  var iq = iqr(qs)
    , lower = iq[0]
    , upper = iq[1]
    , iqdist = upper - lower
    , dist = iqdist * 1.5;

  var vs_lower = dim.filter( gte(lower-dist) );
  var vs_upper = dim.filter( lte(upper+dist) );

  /*
  console.log('tukey lower %o', lower-dist);
  console.log('tukey upper %o', upper+dist);
  */

  var w_lower = head( numericSort(vs_lower) );
  var w_upper = last( numericSort(vs_upper) );

  return [w_lower, w_upper];
}

function scale(d,r){
  var factor = (r[1] - r[0]) / (d[1] - d[0]) ;
  return function(n){
    return Math.round( ((n - d[0]) * factor) + r[0] );
  }
}

function roundSigFig(n,digits){
  if (n==0) return n;
  var mult = Math.pow(10, digits - Math.floor(Math.log(n)/Math.LN10) - 1);
  return Math.round(n*mult)/mult;
}

function zeroArray(v,n){
  var ret = Array(n);
  for (var i=0;i<n;++i){
    ret[i] = v;
  }
  return ret;
}

function gte(x){
  return function(y){
    return y >= x;
  }
}

function lte(x){
  return function(y){
    return y <= x;
  }
}

function gt(x){
  return function(y){
    return y > x;
  }
}

function lt(x){
  return function(y){
    return y < x;
  }
}

