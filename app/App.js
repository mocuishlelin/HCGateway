import { StyleSheet, Text, View, TextInput, Button, Switch } from 'react-native';
import React from 'react';
import {
  initialize,
  requestPermission,
  readRecords,
  readRecord
} from 'react-native-health-connect';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import axios from 'axios';
import ReactNativeForegroundService from '@supersami/rn-foreground-service';
import {requestNotifications} from 'react-native-permissions';

const setObj = async (key, value) => { try { const jsonValue = JSON.stringify(value); await AsyncStorage.setItem(key, jsonValue) } catch (e) { console.log(e) } }
const setPlain = async (key, value) => { try { await AsyncStorage.setItem(key, value) } catch (e) { console.log(e) } }
const get = async (key) => { try { const value = await AsyncStorage.getItem(key); if (value !== null) { try { return JSON.parse(value) } catch { return value } } } catch (e) { console.log(e) } }
const delkey = async (key, value) => { try { await AsyncStorage.removeItem(key) } catch (e) { console.log(e) } }
const getAll = async () => { try { const keys = await AsyncStorage.getAllKeys(); return keys } catch (error) { console.error(error) } }

ReactNativeForegroundService.register();

let login;
let apiBase = 'https://ley.best/hc';
let lastSync = null;
let taskDelay = 7200 * 1000; // 2 hours

Toast.show({
  type: 'info',
  text1: "Loading API Base URL...",
  autoHide: false
})
get('apiBase')
.then(res => {
  if (res) {
    apiBase = res;
    Toast.hide();
    Toast.show({
      type: "success",
      text1: "API Base URL loaded",
    })
  }
  else {
    Toast.hide();
    Toast.show({
      type: "error",
      text1: "API Base URL not found. Using default server.",
    })
  }
})

get('login')
.then(res => {
  if (res) {
    login = res;
  }
})

get('lastSync')
.then(res => {
  if (res) {
    lastSync = res;
  }
})


const askForPermissions = async () => {
  const isInitialized = await initialize();

  const grantedPermissions = await requestPermission([
    { accessType: 'read', recordType: 'HeartRate' },
    { accessType: 'read', recordType: 'RestingHeartRate' },
    { accessType: 'read', recordType: 'SleepSession' },
  ]);

  console.log(grantedPermissions);

  // if (grantedPermissions.length < 34) {
  //   Toast.show({
  //     type: 'error',
  //     text1: "Permissions not granted",
  //     text2: "Please visit settings to grant all permissions."
  //   })
  // }
};

const sync = async () => {
  const isInitialized = await initialize();
  console.log("Syncing data...");
  let numRecords = 0;
  let numRecordsSynced = 0;
  Toast.show({
    type: 'info',
    text1: "Syncing data...",
  })
  await setPlain('lastSync', new Date().toISOString());
  lastSync = new Date().toISOString();

  let recordTypes = ["HeartRate", "RestingHeartRate", "SleepSession"]; 
  
  for (let i = 0; i < recordTypes.length; i++) {
      let records = await readRecords(recordTypes[i],
        {
          timeRangeFilter: {
            operator: "between",
            startTime: String(new Date(new Date().setDate(new Date().getDate() - 29)).toISOString()),
            endTime: String(new Date().toISOString())
          }
        }
      );
      console.log(recordTypes[i]);
      numRecords += records.length;

      if (['SleepSession', 'HeartRate'].includes(recordTypes[i])) {
        console.log("INSIDE IF - ", recordTypes[i])
        for (let j=0; j<records.length; j++) {
          console.log("INSIDE FOR", j, recordTypes[i])
          setTimeout(async () => {
            try {
              let record = await readRecord(recordTypes[i], records[j].metadata.id);
              await axios.post(`${apiBase}/api/sync/${recordTypes[i]}`, {
                userid: login,
                data: record
              })
            }
            catch (err) {
              console.log(err)
            }

            numRecordsSynced += 1;
            try {
            ReactNativeForegroundService.update({
              id: 1244,
              title: 'HCGateway Sync Progress',
              message: `HCGateway is currently syncing... [${numRecordsSynced}/${numRecords}]`,
              icon: 'ic_launcher',
              setOnlyAlertOnce: true,
              color: '#000000',
              progress: {
                max: numRecords,
                curr: numRecordsSynced,
              }
            })
            }
            catch {}
          }, j*3000)
        }
      }

      else {
        await axios.post(`${apiBase}/api/sync/${recordTypes[i]}`, {
          userid: login,
          data: records
        });
        numRecordsSynced += records.length;
        try {
        ReactNativeForegroundService.update({
          id: 1244,
          title: 'HCGateway Sync Progress',
          message: `HCGateway is currently syncing... [${numRecordsSynced}/${numRecords}]`,
          icon: 'ic_launcher',
          setOnlyAlertOnce: true,
          color: '#000000',
          progress: {
            max: numRecords,
            curr: numRecordsSynced,
          }
        })
        }
        catch {}
      }
  }
}
  

export default function App() {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const [form, setForm] = React.useState(null);

  const loginFunc = async () => {
    Toast.show({
      type: 'info',
      text1: "Logging in...",
      autoHide: false
    })

    try {
    let response = await axios.post(`${apiBase}/api/login`, form);
    if ('sessid' in response.data) {
      console.log(response.data.sessid);
      setPlain('login', response.data.sessid).then(() => {
        login = response.data.sessid;
        forceUpdate();
        Toast.hide();
        Toast.show({
          type: 'success',
          text1: "Logged in successfully",
        })
        askForPermissions();
      })
    }
    else {
      Toast.hide();
      Toast.show({
        type: 'error',
        text1: "Login failed",
        text2: response.data.error
      })
    }
    }

    catch (err) {
      Toast.hide();
      Toast.show({
        type: 'error',
        text1: "Login failed",
        text2: "Your credentials may be incorrect. Please try again."
      })
    }
  }

  React.useEffect(() => {
    requestNotifications(['alert']).then(({status, settings}) => {
      console.log(status, settings)
    });

    get('login')
    .then(res => {
      if (res) {
        login = res;
        get('taskDelay')
        .then(res => {
          if (res) taskDelay = Number(res);
        })
        ReactNativeForegroundService.add_task(() => sync(), {
          delay: taskDelay,
          onLoop: true,
          taskId: 'hcgateway_sync',
          onError: e => console.log(`Error logging:`, e),
        });
        forceUpdate()
      }
    })
  }, [login])


  const startTask = () => {
    ReactNativeForegroundService.start({
      id: 1244,
      title: 'HCGateway Sync Service',
      message: 'HCGateway is working in the background to sync your data.',
      icon: 'ic_launcher',
      setOnlyAlertOnce: true,
      color: '#000000',
    }).then(() => console.log('Foreground service started'));
  };

  const stopTask = () => {
    ReactNativeForegroundService.stopAll();
  };

  return (
    <View style={styles.container}>
      {login &&
        <View>
          <Text style={{ fontSize: 20, marginVertical: 10 }}>Your User ID is {login}. Do NOT share this with anyone.</Text>
          <Text style={{ fontSize: 17, marginVertical: 10 }}>Last Sync: {lastSync}</Text>

          <Text style={{ marginTop: 10, fontSize: 15 }}>API Base URL:</Text>
          <TextInput
            style={styles.input}
            placeholder="API Base URL"
            defaultValue={apiBase}
            onChangeText={text => {
              apiBase = text;
              setPlain('apiBase', text);
            }}
          />

          <Text style={{ marginTop: 10, fontSize: 15 }}>Sync Interval (in seconds) (defualt is 2 hours):</Text>
          <TextInput
            style={styles.input}
            placeholder="Sync Interval"
            keyboardType='numeric'
            defaultValue={(taskDelay / 1000).toString()}
            onChangeText={text => {
              taskDelay = Number(text) * 1000;
              setPlain('taskDelay', String(text * 1000));
              ReactNativeForegroundService.update_task(() => sync(), {
                delay: taskDelay,
              })
              Toast.show({
                type: 'success',
                text1: "Sync interval updated",
              })
            }}
          />

        

          <View style={{ marginTop: 20 }}>
            <Button
              title="Sync Now"
              onPress={() => {
                sync()
              }}
            />
          </View>

          <View
          style={{ 
            marginTop: 20,
            flexDirection: 'row',
            justifyContent: 'space-around',
            width: '100%'
           }}
          >
            <Button
              title="Start Sync Service"
              onPress={() => {
                startTask()
                Toast.show({
                  type: 'success',
                  text1: "Sync service started",
                })
              }}
            />
            <Button
              title="Stop Sync Service"
              onPress={() => {
                stopTask();
                ReactNativeForegroundService.add_task(() => sync(), {
                  delay: taskDelay,
                  onLoop: true,
                  taskId: 'hcgateway_sync',
                  onError: e => console.log(`Error logging:`, e),
                });
                Toast.show({
                  type: 'success',
                  text1: "Sync service stopped",
                })
              }}
            />
          </View>

          <View style={{ marginTop: 100 }}>
            <Button
              title="Logout"
              onPress={() => {
                delkey('login');
                login = null;
                Toast.show({
                  type: 'success',
                  text1: "Logged out successfully",
                })
                forceUpdate();
              }}
            />
          </View>
        </View>
      }
      {!login &&
        <View>
          <Text style={{ 
            fontSize: 30,
            fontWeight: 'bold',
            textAlign: 'center',
           }}>Login</Text>

           <Text style={{ marginVertical: 10 }}>If you don't have an account, one will be made for you when logging in.</Text>

          <TextInput
            style={styles.input}
            placeholder="Username"
            onChangeText={text => setForm({ ...form, username: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry={true}
            onChangeText={text => setForm({ ...form, password: text })}
          />
          <Text style={{ marginVertical: 10 }}>API Base URL:</Text>
          <TextInput
            style={styles.input}
            placeholder="API Base URL"
            defaultValue={apiBase}
            onChangeText={text => {
              apiBase = text;
              setPlain('apiBase', text);
            }}
          />

          

          <Button
            title="Login"
            onPress={() => {
              loginFunc()
            }}
          />
        </View>
      }

    <Toast />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    textAlign: "center",
    padding: 50
  },

  input: {
    height: 50,
    marginVertical: 7,
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    width: 350,
    fontSize: 17
  },

});
