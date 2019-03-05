### Node Servers Custom Parameters Set Up

Custom parameters takes a list of parameter objects. Each item in the list can represent 4 different possibilities:

* Individual parameter
* List / array of individual parameters
* A complex object
* List / array of complex objects

#### Common Elements

* name - key used to store this value during node server configuration
* title - shown in Polyglot UI configuration screen
* desc - (optional) description shown as a tooltip in Polyglot UI

#### Individual Parameter Setup

* defaultValue - (optional) used when user doesn't specify value in UI
* isRequired - (optional, defaults to false) if set will prevent configuration from being submitted until user fills this parameter
* type - (optional, defaults to STRING) used for parameter type validation. Type can be STRING, NUMBER or BOOL. BOOL parameter will accept:
    * on
    * off
    * true
    * false
    * yes
    * no

Example of individual parameter:

```javascript
{
    'name': 'port',
    'title': 'Server Port',
    'desc': 'Port used to connect to server',
    'isRequired': true,
    'defaultValue': 1234,
    'type': NUMBER
}
```

Resulting configuration will look like this:

```javascript
{ 'port': 1234 }
```

#### List / Array of Individual Parameters Setup

To turn individual parameter into a list, set `isList` element to `true`.

Example of individual parameters list:

```javascript
{
    'name': 'ports',
    'title': 'Server Port List',
    'desc': 'Ports used to connect to server',
    'isRequired': true,
    'defaultValue': [ 1234 ],
    'type': NUMBER,
    'isList': true
}
```

Resulting configuration will look like this:

```javascript
{ 'port': [ 1234, 1236 ] }
```

#### Complex Object Setup

Complex object has element `params`, which is, recursively, a list of parameters, following the same rules as custom parameters.

Example of complex object:

```javascript
{
    'name': 'serverConfig',
    'title': 'Server Configuration',
    'desc': 'Ports used to connect to server',
    'params': [
        {
            'name': 'hostName',
            'title': 'Host Name',
            'desc': 'Host used to connect to server'
        },
        {
            'name': 'ports',
            'title': 'Server Port List',
            'desc': 'Ports used to connect to server',
            'isRequired': true,
            'defaultValue': 1234,
            'type': NUMBER
        }
    ]
}
```

Resulting configuration will look like this:

```javascript
{
    'serverConfig': {
        'hostName': 'abc',
        'port': 1234
    }
}
```

#### List / Array of Complex Objects Setup

Similar to list of individual parameters, turn complex object into a list by setting `isList` element to `true`.

Example of complex object list:

```javascript
{
    'name': 'serverConfig',
    'title': 'Server Configuration',
    'desc': 'Ports used to connect to server',
    'isList': true,
    'params': [
        {
            'name': 'hostName',
            'title': 'Host Name',
            'desc': 'Host used to connect to server'
        },
        {
            'name': 'ports',
            'title': 'Server Port List',
            'desc': 'Ports used to connect to server',
            'isRequired': true,
            'defaultValue': 1234,
            'type': NUMBER
        }
    ]
}
```

Resulting configuration will look like this:

```javascript
{
    'serverConfig': [
        {
            'hostName': 'abc',
            'port': 1234
        }
    ]
}
```
