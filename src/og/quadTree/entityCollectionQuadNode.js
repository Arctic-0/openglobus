goog.provide('og.quadTree.EntityCollectionQuadNode');
goog.provide('EntityCollectionQuadNodeWGS84');

goog.require('og.Extent');
goog.require('og.quadTree');
goog.require('og.LonLat');
goog.require('og.EntityCollection');
goog.require('og.bv.Box');
goog.require('og.bv.Sphere');
goog.require('og.inheritance');

og.quadTree.EntityCollectionQuadNode = function (layer, partId, parent, id, extent, planet, zoom) {
    this.layer = layer;
    this.parentNode = parent;
    this.childrenNodes = [];
    this.partId = partId;
    this.nodeId = partId + id;
    this.state = null;
    this.extent = extent;
    this.count = 0;
    this.entityCollection = null;
    this.zoom = zoom;

    this.bsphere = new og.bv.Sphere();

    planet && this._setExtentBounds();
};

og.quadTree.EntityCollectionQuadNode.prototype.insertEntity = function (entity, isInside) {

    var p = this._setLonLat(entity);

    if (isInside || p && this.extent.isInside(p)) {

        this.count++;

        if (this.count > this.layer._maxCountPerCollection) {
            var cn = this.childrenNodes;
            if (cn.length) {
                if (cn[og.quadTree.NW].extent.isInside(p)) {
                    cn[og.quadTree.NW].insertEntity(entity, true);
                } else if (cn[og.quadTree.NE].extent.isInside(p)) {
                    cn[og.quadTree.NE].insertEntity(entity, true);
                } else if (cn[og.quadTree.SW].extent.isInside(p)) {
                    cn[og.quadTree.SW].insertEntity(entity, true);
                } else if (cn[og.quadTree.SE].extent.isInside(p)) {
                    cn[og.quadTree.SE].insertEntity(entity, true);
                }
            } else {
                /** Saves node's old entities, clears entityCollection
                    and adds new entity to the node */
                var entities = this.entityCollection.getEntities();
                entities.push(entity);
                this.entityCollection.events.clear();
                this.entityCollection.clear();
                this.entityCollection = null;
                this._freeCollection();

                /** Build sub tree with new inserted entity */
                this.buildTree(entities);
            }
        } else {
            this._addEntitiesToCollection([entity]);
        }
    }
};

og.quadTree.EntityCollectionQuadNode.prototype._addEntitiesToCollection = function (entities) {
    if (entities.length) {
        var l = this.layer,
            p = l._planet,
            ell = p.ellipsoid,
            ext = this.extent;

        var ec = this.entityCollection;

        if (!ec) {
            ec = new og.EntityCollection();
            ec._layer = this.layer;
            ec.addTo(p, true);
            ec._quadNode = this;
            l._bindEventsDefault(ec);
            this.entityCollection = ec;

            ec.events.on("entityremove", this, function (e) {
                e.remove();
                var node = this;
                while (node) {
                    this.count--;
                    node = node.parentNode;
                }
            });
        }

        ec.addEntities(entities);
    }
};

og.quadTree.EntityCollectionQuadNode.prototype._setExtentBounds = function () {
    if (!this.nodeId) {
        this.bsphere.radius = this.layer._planet.ellipsoid._a;
        this.bsphere.center = new og.math.Vector3();
    } else {
        this.bsphere.setFromExtent(this.layer._planet.ellipsoid, this.extent.inverseMercator());
    }
};

og.quadTree.EntityCollectionQuadNode.prototype._setLonLat = function (entity) {
    if (!entity._lonlat) {
        entity._lonlat = this.layer._planet.ellipsoid.cartesianToLonLat(entity._cartesian);
    }
    if (entity._lonlat.lat < og.mercator.MAX_LAT && entity._lonlat.lat > og.mercator.MIN_LAT) {
        entity._lonlatMerc = entity._lonlat.forwardMercator();
    } else {
        entity._lonlatMerc = null;
    }
    return entity._lonlatMerc;
};

og.quadTree.EntityCollectionQuadNode.prototype.buildTree = function (entities) {

    this.count = entities.length;

    if (entities.length > this.layer._maxCountPerCollection || this.zoom < this.layer.minZoom || this.zoom < 5) {
        var cn = this.childrenNodes;
        if (!cn.length) {
            this.createChildrenNodes();
        }

        var en_nw = [], en_ne = [], en_sw = [], en_se = [];

        var i = entities.length;
        while (i--) {
            var ei = entities[i];

            var p = this._setLonLat(ei);

            if (p) {
                if (cn[og.quadTree.NW].extent.isInside(p)) {
                    en_nw.push(ei);
                } else if (cn[og.quadTree.NE].extent.isInside(p)) {
                    en_ne.push(ei);
                } else if (cn[og.quadTree.SW].extent.isInside(p)) {
                    en_sw.push(ei);
                } else if (cn[og.quadTree.SE].extent.isInside(p)) {
                    en_se.push(ei);
                }
            }
        }

        en_nw.length && cn[og.quadTree.NW].buildTree(en_nw);
        en_ne.length && cn[og.quadTree.NE].buildTree(en_ne);
        en_sw.length && cn[og.quadTree.SW].buildTree(en_sw);
        en_se.length && cn[og.quadTree.SE].buildTree(en_se);

    } else {

        this._addEntitiesToCollection(entities);
    }
};


og.quadTree.EntityCollectionQuadNode.prototype.createChildrenNodes = function () {
    var l = this.layer;
    var ext = this.extent;
    var size_x = ext.getWidth() * 0.5;
    var size_y = ext.getHeight() * 0.5;
    var ne = ext.northEast,
        sw = ext.southWest;
    var id = this.nodeId * 4 + 1;
    var c = new og.LonLat(sw.lon + size_x, sw.lat + size_y);
    var nd = this.childrenNodes;
    var p = this.layer._planet;
    var z = this.zoom + 1;

    nd[og.quadTree.NW] = new og.quadTree.EntityCollectionQuadNode(l, og.quadTree.NW, this, id,
        new og.Extent(new og.LonLat(sw.lon, sw.lat + size_y), new og.LonLat(sw.lon + size_x, ne.lat)), p, z);

    nd[og.quadTree.NE] = new og.quadTree.EntityCollectionQuadNode(l, og.quadTree.NE, this, id,
        new og.Extent(c, new og.LonLat(ne.lon, ne.lat)), p, z);

    nd[og.quadTree.SW] = new og.quadTree.EntityCollectionQuadNode(l, og.quadTree.SW, this, id,
        new og.Extent(new og.LonLat(sw.lon, sw.lat), c), p, z);

    nd[og.quadTree.SE] = new og.quadTree.EntityCollectionQuadNode(l, og.quadTree.SE, this, id,
        new og.Extent(new og.LonLat(sw.lon + size_x, sw.lat), new og.LonLat(ne.lon, sw.lat + size_y)), p, z);
};

og.quadTree.EntityCollectionQuadNode.prototype.collectRenderCollections = function (visibleNodes, outArr) {
    var p = this.layer._planet;
    var cam = p.renderer.activeCamera;
    var n = visibleNodes[this.nodeId];

    if (n) {
        var cn = this.childrenNodes;
        if (this.entityCollection) {
            this.entityCollection._animatedOpacity = this.layer.opacity;
            this.entityCollection.scaleByDistance = this.layer.scaleByDistance;
            outArr.push(this.entityCollection);
        } else if (cn.length) {
            if (n.state === og.quadTree.RENDERING) {
                this.layer._secondPASS.push(this);
            } else {
                cn[og.quadTree.NW].collectRenderCollections(visibleNodes, outArr);
                cn[og.quadTree.NE].collectRenderCollections(visibleNodes, outArr);
                cn[og.quadTree.SW].collectRenderCollections(visibleNodes, outArr);
                cn[og.quadTree.SE].collectRenderCollections(visibleNodes, outArr);
            }
        }
    }
};

og.quadTree.EntityCollectionQuadNode.prototype.collectRenderCollectionsPASS2 = function (outArr) {
    var p = this.layer._planet;
    var cam = p.renderer.activeCamera;
    if (cam.eye.distance(this.bsphere.center) - this.bsphere.radius <
        og.quadTree.QuadNode.VISIBLE_DISTANCE * Math.sqrt(cam._lonLat.height) &&
        p.renderer.activeCamera.frustum.containsSphere(this.bsphere) > 0) {
        var cn = this.childrenNodes;
        if (this.entityCollection) {
            this.entityCollection._animatedOpacity = this.layer.opacity;
            this.entityCollection.scaleByDistance = this.layer.scaleByDistance;
            outArr.push(this.entityCollection);
        } else if (cn.length) {
            cn[og.quadTree.NW].collectRenderCollectionsPASS2(outArr);
            cn[og.quadTree.NE].collectRenderCollectionsPASS2(outArr);
            cn[og.quadTree.SW].collectRenderCollectionsPASS2(outArr);
            cn[og.quadTree.SE].collectRenderCollectionsPASS2(outArr);
        }
    }
};

/**
 * @class
 */
og.quadTree.EntityCollectionQuadNodeWGS84 = function (layer, partId, parent, id, extent, planet, zoom) {
    og.inheritance.base(this, layer, partId, parent, id, extent, planet, zoom);
};

og.inheritance.extend(og.quadTree.EntityCollectionQuadNodeWGS84, og.quadTree.EntityCollectionQuadNode);

og.quadTree.EntityCollectionQuadNodeWGS84.prototype._setExtentBounds = function () {
    this.bsphere.setFromExtent(this.layer._planet.ellipsoid, this.extent);
};

og.quadTree.EntityCollectionQuadNodeWGS84.prototype._setLonLat = function (entity) {
    if (!entity._lonlat) {
        entity._lonlat = this.layer._planet.ellipsoid.cartesianToLonLat(entity._cartesian);
    }
    return entity._lonlat;
};