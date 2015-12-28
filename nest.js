// Poor man's d3.nest

module.exports = function nest(x,y,rollup){
  
  var accum = function(acc,rec){
    var xval = x(rec), yval = y(rec);
    // return assoc(xval, append(yval, acc[xval] || []), acc);   // note immutable method too costly with big data
    acc[xval] = acc[xval] || [];
    acc[xval].push(yval);
    return acc;
  }
    
  return function(data){
    var raw = data.reduce(accum,{});
    if (!(rollup)) return raw;
    var ret = {};
    for (var k in raw){
      ret[k] = rollup(raw[k]);
    }
    return ret;
  }
  
}