# Generated by Django 3.1.2 on 2020-10-01 14:19

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="account",
            name="username",
            field=models.CharField(default="default_username", max_length=50),
            preserve_default=False,
        ),
    ]
