=================================
METAVIEW SERVER SQL INTERFACE SDK
=================================

This directory contains the resources needed to integrate with the MetaView
Server SQL shadow configuration database.  For more information about using
this interface please see the "MetaView APIs Programmer's Guide".
This readme explains the contents of this directory.

PostgreSQL tools
----------------

 psqlodbc_x86.msi
   This is the installation package (32 bits) for a Windows ODBC driver for
   PostgreSQL databases.

 psqlodbc_x64.msi
   This is the installation package (64 bits) for a Windows ODBC driver for
   PostgreSQL databases.

 pqslodbc_readme.txt
 license.txt
   These files provide the license under which psqlodbc is distributed.

Shadow configuration database
-----------------------------

 ShadowConfigDbSchema.txt
   This details the complete structure of the shadow configuration database,
   listing all the available tables and fields along with the equivalent
   field and Service Indication in the SOAP schema.

 ShadowConfigDbSampleQueries.txt
   Some sample SQL queries that give a small flavour of the sort of questions
   that the shadow configuration database can answer.
