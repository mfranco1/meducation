from .models import Account
from .serializers import AccountSerializer
from rest_framework import generics


class AccountListCreate(generics.ListCreateAPIView):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
