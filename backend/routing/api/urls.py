from django.urls import path

from routing.api.views import RouteView

urlpatterns = [
    path("routes", RouteView.as_view(), name="route"),
]
