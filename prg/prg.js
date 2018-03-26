"use strict";
/**
 * prg loader
 * @module se-renderer.server.extensions.loaders.prg
 * @description
 * loads address points from [PRG] xml files:
 (http://www.gugik.gov.pl/geodezja-i-kartografia/pzgik/dane-bez-oplat/dane-z-panstwowego-rejestru-granic-i-powierzchni-jednostek-podzialow-terytorialnych-kraju-prg)
  using [xml-stream](https://github.com/assistunion/xml-stream) to read large xml files
  using [proj4](https://github.com/proj4js/proj4js) to project source EPSG:2180 to lonlat
**/

  const Promise = require('bluebird');
  const _ = require('lodash');
  const Fs = require('fs-extra');
  const Path = require('path');

  const  db = require('../../modules/db/db');     // db wrapper (init connection to postgres, expose masive db obj) using massive-js
  const dir = require("node-dir");                // used to read files (paths) from dir

  const moment = require('moment');

  const XmlStream = require('xml-stream'); // https://github.com/assistunion/xml-stream

  const proj4 = require('proj4');           // converter of geo projections

  const addrPointsTable = "address_points";

  var prgXmlFilesDir = "/Volumes/ssd500/SE/SE_DATA/punkty_adresowe";      // path folder with prg xml files


/**
  @function load
  @description reads files from prgXmlFilesDir (set earlier)
  and for each file, in sequence, runs loadPrg
**/


  function loadAllPrg(b){
    return new Promise(function(resolve,reject){
      var results = {};
      dir.promiseFiles(prgXmlFilesDir,'file',{recursive:false})
      .then((files)=>{
          files = files.filter(function(f){
            var fName = Path.basename(f),
                fExt = Path.extname(fName);
            //console.log("fName=",fName," fExt=",fExt);
            return (fName.substring(0,1)!=".") && (fExt == ".xml");
          })
          console.log("files=",files);
          var i=0, len = files.length;

          function doLoad(){
            loadPrg({file:files[i]})
            .then(resp => {
              results[files[i]] = resp;
              next();
            });
          };

          doLoad();

          function next(){
            i++;
            if(i<len) doLoad();
            else resolve(results);
          };

      })
      .catch(e=>{
        console.error(e);
        reject(e);
      })
    });
  };


/**
  @function loadPrg
  @param b {object} - params object like:
  <pre>
    {
      file:'full file path to load from'
    }
  </pre>
  @description reads & parses xml file using XmlStream;
  uses addressPointObj() constructor to create obj/record and calls saveToDb to store record in db;
  stream is paused for db operation and resumed when it is resolved;
  // parse xml to json
  // construct record
  // save to db
    we get ~ 225 records / second
**/

  function loadPrg(b){
    console.log("Address.loadPrg b =",b);
    return new Promise(function(resolve,reject){
      if(!b.file) reject({err:true,msg:"missing file"});
      else {
        var i = 0, start = moment();
        var stream = Fs.createReadStream(b.file);
        var xml = new XmlStream(stream);
        var errors = [];

        xml.collect('prg-ad:jednostkaAdmnistracyjna');

        xml.on('endElement:prg-ad:PRG_PunktAdresowy', function(item) {
          var addressPoint = new addressPointObj(item);
          i++;
          xml.pause();
          saveToDb(addressPoint,addrPointsTable)
          .then(resp => {
            process.stdout.write("Processing " + i + " record\r");
            xml.resume();
          }).catch(err => {
            errors.push(err);
            resume();
          })
        });

        xml.on('error', function(message) {
          console.log('Parsing failed: ' + message);
          reject(err);
        });

        xml.on('end', function(item) {
          var msg = 'processed '+i+" items in "+(moment().diff(start))/1000+" sec.";
          console.log(msg+" Errors="+errors);
          resolve({msg:msg,err:errors});
        });
      }
    });

  };

/**
  construct addressPoint record
**/

  function addressPointObj(t){
    //console.log("addressPointObj t['prg-ad:miejscowosc']=",t["prg-ad:miejscowosc"]);
    this.state = t["prg-ad:jednostkaAdmnistracyjna"][1];
    this.district = t["prg-ad:jednostkaAdmnistracyjna"][2];
    this.county = t["prg-ad:jednostkaAdmnistracyjna"][3];
    this.place = t["prg-ad:miejscowosc"];
    this.street = t["prg-ad:ulica"];
    this.number = t["prg-ad:numerPorzadkowy"];
    this.zip = t["prg-ad:kodPocztowy"];
    this.status = t["prg-ad:status"];
    var pos = t["prg-ad:pozycja"]["gml:Point"]["gml:pos"].split(" ");
    pos = pos.map(function(p){return parseFloat(p)}).reverse();
    var location = epsgToLonLat(pos);
    this.location = "("+location.join(",")+")";
    this.lat = location[1];
    this.lon = location[0];
    this.prg_id = t["$"]["gml:id"];
    this.prg_loc_id = t["prg-ad:idIIP"]["bt:BT_Identyfikator"]["bt:lokalnyId"];
    this.ver = t["prg-ad:idIIP"]["bt:BT_Identyfikator"]["bt:wersjaId"];
  };


/**
  EPSG:2180 to lonlat
   todo: use proj4js https://github.com/proj4js/proj4js for projection conversion
  ```
  -proj +proj=longlat +datum=WGS84 +no_defs from='+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
  ```
  proj4(fromProjection[, toProjection, coordinates])

**/

  function epsgToLonLat(coordinates){
    var fromProj = "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
        toProj = "+proj=longlat +datum=WGS84 +no_defs",
        result = proj4(fromProj,toProj,coordinates);
    return result;
  };


/**
  @function saveToDb
  @param data {object} - data obj to be saved
  @param table {string} - table name to save to
  @param schema {string=} - table schema; defaults to 'se_staging'
  @description - saves data to the table; schema is fixed to
**/

  function saveToDb(data,table,schema){
    schema = schema || "se_staging"
    return db[schema][table].save(data);
  };


  module.exports = {
    loadPrg:loadAllPrg
  };