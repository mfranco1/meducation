from django.urls import path
from . import views


urlpatterns = [
    path("api/account/", views.AccountListCreate.as_view()),
]
