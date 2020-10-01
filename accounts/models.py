from django.db import models


class Account(models.Model):
    username = models.CharField(max_length=50)
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    email = models.EmailField()
    date_created = models.DateTimeField(auto_now_add=True)
    date_updated = models.DateTimeField(auto_now=True)

    def __repr__(self):
        return (
            f"{type(self).__name__}(username={self.username!r}, "
            f"first_name={self.first_name!r}, last_name={self.last_name!r}, "
            f"email={self.email!r}, date_created={self.date_created}, "
            f"date_updated={self.date_updated})"
        )
