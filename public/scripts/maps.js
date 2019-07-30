function init() {
  var options = {
    center: {lat: 49.2501, lng: -123.0824},
    zoom: 11,
    mapTypeId: 'roadmap'
  }

  var map = new google.maps.Map(document.getElementById('map'), options);

  // Create the search box and link it to the UI element.
  var input = document.getElementById('pac-input');
  var searchBox = new google.maps.places.SearchBox(input);
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(input);

  // Bias the SearchBox results towards current map's viewport.
  map.addListener('bounds_changed', function() {
    searchBox.setBounds(map.getBounds());
  });

  var markers = [];
  var infowindow = new google.maps.InfoWindow();
  var service = new google.maps.places.PlacesService(map);

  // Listen for the event fired when the user selects a prediction and retrieve
  // more details for that place.
  searchBox.addListener('places_changed', function() {
    var places = searchBox.getPlaces();
    console.log(places);
    if (places.length == 0) {
      return;
    }

    // Clear out the old markers.
    markers.forEach(function(marker) {
      marker.setMap(null);
    });
    markers = [];

    // For each place, get the icon, name and location.
    var bounds = new google.maps.LatLngBounds();
    places.forEach(function(place) {
      var request = {
        placeId: place.place_id,
        fields: ['name', 'formatted_address', 'place_id', 'geometry', 'opening_hours', 'rating']
      };

      if (!place.geometry) {
        console.log("Returned place contains no geometry");
        return;
      }
      var icon = {
        url: place.icon,
        size: new google.maps.Size(71, 71),
        origin: new google.maps.Point(0, 0),
        anchor: new google.maps.Point(17, 34),
        scaledSize: new google.maps.Size(25, 25)
      };

      service.getDetails(request, function(place, status) {
       if (status === google.maps.places.PlacesServiceStatus.OK) {
         // Create a marker for each place.
         var marker = new google.maps.Marker({
           map: map,
           icon: icon,
           title: place.name,
           position: place.geometry.location
         })
         markers.push(marker);
         console.log(marker);
         //display place info
         google.maps.event.addListener(marker, 'click', function() {
           infowindow.setContent('<div><strong>' + place.name + '</strong><br>' +
             place.formatted_address + '<br>' +
             'Rating: ' + place.rating + '</div>');
           infowindow.open(map, this);
         });
       }
     });


      if (place.geometry.viewport) {
        // Only geocodes have viewport.
        bounds.union(place.geometry.viewport);
      } else {
        bounds.extend(place.geometry.location);
      }


    });
    map.fitBounds(bounds);
  });
}

google.maps.event.addDomListener(window, 'load', init);
