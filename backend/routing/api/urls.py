from django.urls import path

from routing.api.views import RouteView, SearchView

urlpatterns = [
    path("routes", RouteView.as_view(), name="route"),
    path("search", SearchView.as_view(), name="search"),
]
