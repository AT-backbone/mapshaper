/* @requires
mapshaper-common
geojson-export
geojson-points
geojson-to-svg
mapshaper-svg-style
svg-common
*/

//
//
internal.exportSVG = function(dataset, opts) {
  var template = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ' +
    'version="1.2" baseProfile="tiny" width="%d" height="%d" viewBox="%s %s %s %s" stroke-linecap="round" stroke-linejoin="round">\n%s\n</svg>';
  var b, svg;

  // TODO: consider moving this logic to mapshaper-export.js
  if (opts.final) {
    if (dataset.arcs) dataset.arcs.flatten();
  } else {
    dataset = internal.copyDataset(dataset); // Modify a copy of the dataset
  }

  b = internal.transformCoordsForSVG(dataset, opts);
  svg = dataset.layers.map(function(lyr) {
    return SVG.stringify(internal.exportLayerForSVG(lyr, dataset, opts));
  }).join('\n');
  svg = utils.format(template, b.width(), b.height(), 0, 0, b.width(), b.height(), svg);
  return [{
    content: svg,
    filename: opts.file || utils.getOutputFileBase(dataset) + '.svg'
  }];
};

internal.transformCoordsForSVG = function(dataset, opts) {
  var width = opts.width > 0 ? opts.width : 800;
  var margin = opts.margin >= 0 ? opts.margin : 1;
  var bounds = internal.getDatasetBounds(dataset);
  var precision = opts.precision || 0.0001;
  var height, bounds2, fwd;

  if (opts.svg_scale > 0) {
    // alternative to using a fixed width (e.g. when generating multiple files
    // at a consistent geographic scale)
    width = bounds.width() / opts.svg_scale;
    margin = 0;
  }
  internal.padViewportBoundsForSVG(bounds, width, margin);
  height = Math.ceil(width * bounds.height() / bounds.width());
  bounds2 = new Bounds(0, -height, width, 0);
  fwd = bounds.getTransform(bounds2);
  internal.transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });

  internal.setCoordinatePrecision(dataset, precision);
  return bounds2;
};

// pad bounds to accomodate stroke width and circle radius
internal.padViewportBoundsForSVG = function(bounds, width, marginPx) {
  var bw = bounds.width() || bounds.height() || 1; // handle 0 width bbox
  var marg;
  if (marginPx >= 0 === false) {
    marginPx = 1;
  }
  marg = bw / (width - marginPx * 2) * marginPx;
  bounds.padBounds(marg, marg, marg, marg);
};

internal.exportGeoJSONForSVG = function(lyr, dataset, opts) {
  var geojson = internal.exportGeoJSONCollection(lyr, dataset, opts);
  if (opts.point_symbol == 'square' && geojson.features) {
    geojson.features.forEach(function(feat) {
      GeoJSON.convertPointFeatureToSquare(feat, 'r', 2);
    });
  }
  return geojson;
};

internal.exportLayerForSVG = function(lyr, dataset, opts) {
  // TODO: convert geojson features one at a time
  var geojson = internal.exportGeoJSONForSVG(lyr, dataset, opts);
  var features = geojson.features || geojson.geometries || (geojson.type ? [geojson] : []);
  var symbols = SVG.importGeoJSONFeatures(features);
  var layerObj = {
    tag: 'g',
    properties: {id: lyr.name},
    children: symbols
  };

  // add default display properties to line layers
  // (these are overridden by feature-level styles set via -svg-style)
  if (lyr.geometry_type == 'polyline') {
    layerObj.properties.fill = 'none';
    layerObj.properties.stroke = 'black';
    layerObj.properties['stroke-width'] = 1;
  }

  // add default text properties to label layers
  if (lyr.data && lyr.data.fieldExists('label-text')) {
    layerObj.properties['font-family'] = 'sans-serif';
    layerObj.properties['font-size'] = '12';
    layerObj.properties['text-anchor'] = 'middle';
  }

  return layerObj;
};
