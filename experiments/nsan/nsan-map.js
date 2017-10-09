// Specify the size of the wheel area and set the radius, which is the basis
// of our layout
var margin = {top: 350, right: 340, bottom: 350, left: 340},
    radius = Math.min(margin.top, margin.right, margin.bottom, margin.left) - 10;

// Create the wheel svg element and a main group to hold the wheel
var svg = d3.select("#wheel").append("svg")
    .attr("width", margin.left + margin.right)
    .attr("height", margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Define some filters. These let us apply nice effects to the svg. For
// starters we'll make a drop shadow and a gradient
var defs = svg.append( 'defs' );

// The gradient first...
var backgroundGradient = defs.append( 'linearGradient' )
    .attr( 'id', 'mapGradient1' ) // Used to reference reference the gradient
    .attr( 'x1', '0' )
    .attr( 'x2', '0' )
    .attr( 'y1', '0' )
    .attr( 'y2', '1' );

  backgroundGradient.append( 'stop' )
    .attr( 'class', 'map1Stop1' )
    .attr( 'offset', '0%' );

  backgroundGradient.append( 'stop' )
    .attr( 'class', 'map1Stop2' )
    .attr( 'offset', '100%' );

// There used to be a drop shadow here but it was dodgy. Maybe one day.

// Partition is one of d3's built in layouts. See .... for documentation.
// Define a new partition layout. We'll sort the members alphabetically, but
// if you don't want sorting just do .sort(none)
var partition = d3.layout.partition()
    .sort(function(a, b) { return d3.ascending(a.name, b.name); })
    .size([2 * Math.PI, radius]);

// d3 is going to help us build some arcs. We'll build an inner arc for items
// with a depth of 1 - this is our main wheel area where we'll list the active
// competencies. This is going to have an inner radius of 2 fifths of the
// total radius and an outer radius of four fifths of the total radius. 
// We'll also build a secondary arc with an inner radius of four fifths of the
// total radius and an outer radius which equals the total radius. The
// secondary arc gives us a preview of how many child competencies each of the
// main competencies has.
var arc = d3.svg.arc()
    .startAngle(function(d) { return d.x; })
    .endAngle(function(d) { return d.x + d.dx - .01 / (d.depth + .5); })
    .innerRadius(function(d) { 
        return radius / 5 * (d.depth * 2); 
    })
    .outerRadius(function(d) { 
        return radius / 5 * (d.depth + 3); 
    });

// Now we're going to build the wheel. We'll start by reading in a json file, 
// as defined at the top of this script 

d3.json(jsonSource, function(error, root) {

  // We'll work out the sum sizes for each node - nodes in the main arc (ie
  // those with a depth of 1) should be equal sizes. Because of the way the d3
  // partition layout works this means that we'll have to work out how many
  // children each competence has, and assign a value to the children of 1/by
  // that number.
  // Also compute the full name of each competence and stash the children so 
  // they can be restored as we descend.
  partition
      .nodes(root)
      .forEach(function(d) {
        d._children = d.children;
        d.sum = 1;
        if (d.depth > 1) d.sum = 1 / Object.keys(d.parent.children).length; 
        d.label = d.name;
        d.key = key(d);
      });

  // Now redefine the value function to use the previously-computed sum.
  partition
      .children(function(d, depth) { return depth < 2 ? d._children : null; })
      .value(function(d) { return d.sum; });

  // Now start to build up the svg graphic, starting with the central circle.
  // I've actually made it bigger that the total radius, because you might
  // want to fill it with a nice gradient or whatever, but if you just want to
  // fill the centre of the wheel, you could make r equal radius / 5 * 2
  var center = svg.append("circle")
      .attr("r", radius + 5)
      .style("fill", "white")
      .on("click", zoomOut);

  center.append("title")
      .text("zoom out");

  var path = svg.selectAll("path")
      .data(partition.nodes(root).slice(1))
    .enter().append("path")
      .attr("d", arc)
      .style("fill", "url(#mapGradient1)")
      .style("fill-opacity", function(d) { return 1 / d.depth;})
      .each(function(d) { this._current = updateArc(d); })
      .on("click", zoomIn);

  var labels = svg.selectAll("text.label")
      .data(partition.nodes(root).filter(function(d) {return d.depth == 1;}))
    .enter().append("text")
      .attr("class", "label")
      .style("fill", "black")
      .style("text-anchor", "middle")
      .attr("transform", function(d) { 
          return "translate(" + arc.centroid(d) + ")"; 
      })
      .on("click", zoomIn)
      .text(function(d, i) { return d.label;} );
  function zoomIn(p) {
    if (p.depth > 1) p = p.parent;
    if (!p.children) {
      updateDescriptor(p);
    }else{
    svg.selectAll("text.label").data([]).exit().remove()
    updateBreadcrumb(p)
    destroyDescriptor()
    zoom(p, p);}
  }

  function zoomOut(p) {
    if (!p.parent) {
      destroyDescriptor();
    }else{
    svg.selectAll("text.label").data([]).exit().remove()
    updateBreadcrumb(p.parent)
    destroyDescriptor()
    zoom(p.parent, p);}
  }

  // Zoom to the specified new root.
  function zoom(root, p) {
    if (document.documentElement.__transition__) return;

    // Rescale outside angles to match the new layout.
    var enterArc,
        exitArc,
        outsideAngle = d3.scale.linear().domain([0, 2 * Math.PI]);

    function insideArc(d) {
      return p.key > d.key
          ? {depth: d.depth - 1, x: 0, dx: 0} : p.key < d.key
          ? {depth: d.depth - 1, x: 2 * Math.PI, dx: 0}
          : {depth: 0, x: 0, dx: 2 * Math.PI};
    }

    function outsideArc(d) {
      return {depth: d.depth, x: outsideAngle(d.x), dx: outsideAngle(d.x + d.dx) - outsideAngle(d.x)};
    }

    center.datum(root);

    // When zooming in, arcs enter from the outside and exit to the inside.
    // Entering outside arcs start from the old layout.
    if (root === p) enterArc = outsideArc, exitArc = insideArc, outsideAngle.range([p.x, p.x + p.dx]);

    path = path.data(partition.nodes(root).slice(1), function(d) { return d.key; });

    // When zooming out, arcs enter from the inside and exit to the outside.
    // Exiting outside arcs transition to the new layout.
    if (root !== p) enterArc = insideArc, exitArc = outsideArc, outsideAngle.range([p.x, p.x + p.dx]);

    d3.transition().duration(d3.event.altKey ? 7500 : 750).each(function() {
      path.exit().transition()
          .style("fill-opacity", function(d) { return d.depth === 1 + (root === p) ? 1 : 0; })
          .attrTween("d", function(d) { return arcTween.call(this, exitArc(d)); })
          .remove();

      path.enter().append("path")
          .style("fill-opacity", function(d) { return d.depth === 2 - (root === p) ? 1 : 0; })
          .style("fill", "url(#mapGradient1)")
          .on("click", zoomIn)
          .each(function(d) { this._current = enterArc(d); });

      path.transition()
          .style("fill-opacity", function(d) { return 1 / d.depth;})
          .attrTween("d", function(d) { return arcTween.call(this, updateArc(d)); });
    
    labels = labels.data(partition.nodes(root).filter(function(d) {return d.depth == 1;}), function(d) { return d.key; });

      labels.enter().append("text")
      .attr("class", "label")
      .attr("class", "label")
      .style("opacity", 0)
      .style("fill", "black")
      .style("text-anchor", "middle")
      .attr("transform", function(d) { 
          return "translate(" + arc.centroid(d) + ")"; 
      })
      .on("click", zoomIn)
      .text(function(d, i) { return d.label.replace(/.{10}\S*\s+/g, "$&@").split(/\s+@/)[0];} );
      labels.append("tspan")
      .attr("x", 0)
      .attr("dy", "1em")
      .text(function(d, i) { return d.label.replace(/.{10}\S*\s+/g, "$&@").split(/\s+@/)[1];} );
      labels.append("tspan")
      .attr("x", 0)
      .attr("dy", "1em")
      .text(function(d, i) { return d.label.replace(/.{10}\S*\s+/g, "$&@").split(/\s+@/)[2];} );
      labels.transition().duration(1000).style("opacity", 1);
    });
  }
});

function key(d) {
  var k = [], p = d;
  while (p.depth) k.push(p.name), p = p.parent;
  return k.reverse().join(".");
}

function arcTween(b) {
  var i = d3.interpolate(this._current, b);
  this._current = i(0);
  return function(t) {
    return arc(i(t));
  };
}

function updateArc(d) {
  return {depth: d.depth, x: d.x, dx: d.dx};
}

var breadcrumb = d3.select("#breadcrumb");
breadcrumb.html("<div>NSAN Wheel</div>");

function breadcrumbText(p) { 
  return p.key === "" ? p.key : "<div>" + p.key.replace(/\./g, '</div><div>') + "</div>";
}

function updateBreadcrumb(p) {
  breadcrumb.html("<div>NSAN Wheel</div>" + breadcrumbText(p));
}

var descriptor = d3.select("#descriptor");

function updateDescriptor(p) {
  descriptor.html("<p>" + p.description + "</p>")
  descriptor.transition().duration(200).style("opacity","1");
}

function destroyDescriptor() {
  descriptor.transition().duration(200).style("opacity","0");
}

d3.select(self.frameElement).style("height", margin.top + margin.bottom + "px");

