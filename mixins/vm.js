/* eslint-disable */
import _ from 'lodash';
import randomstring from 'randomstring';
import { sortBy } from '@/utils/sort';
import { allHash } from '@/utils/promise';
import { MemoryUnit } from '@/config/map';
import {
  NAMESPACE, PVC, VM_TEMPLATE, IMAGE, SSH, VMI, STORAGE_CLASS, NETWORK_ATTACHMENT
} from '@/config/types';
import { STORAGE_CLASS_LABEL } from '@/config/labels-annotations';

// const SOURCE_TYPE = {
//   ATTACH_CLONED: 'Attach Cloned Disks',
//   ATTACH:        'Attach Disks',
//   BLANK:         'blank',
//   URL:           'url'
// };

const SOURCE_TYPE = {
  URL:            'VM Image',
  BLANK:          'blank',
  ATTACH_VOLUME:  'attach volume',
  CONTAINER_DISK: 'Container'
};

export default {
  inheritAttrs: false,

  props: {
    value: {
      type:    [String, Number, Object],
      default: ''
    },
  },

  async fetch() {
    const hash = await allHash({
      ssh:                this.$store.dispatch('cluster/findAll', { type: SSH }),
      pvcs:               this.$store.dispatch('cluster/findAll', { type: PVC }),
      image:              this.$store.dispatch('cluster/findAll', { type: IMAGE }),
      template:           this.$store.dispatch('cluster/findAll', { type: VM_TEMPLATE.template }),
      storageClass:       this.$store.dispatch('cluster/findAll', { type: STORAGE_CLASS, opt: { url: `${ STORAGE_CLASS }es` } }),
      templateVersion:    this.$store.dispatch('cluster/findAll', { type: VM_TEMPLATE.version }),
      networkAttachment:  this.$store.dispatch('cluster/findAll', { type: NETWORK_ATTACHMENT, opt: { url: 'k8s.cni.cncf.io.network-attachment-definitions' } }),
    });
  },

  data() {
    return {
      source:     '',
      sshKey:     [],
      imageName:  '',
      sshName:    '',
      publicKey:  '',
      cloudInit:  '',
      showCloudInit: false
    };
  },

  computed: {
    ssh() {
      const ssh = this.$store.getters['cluster/all'](SSH);

      return ssh;
    },

    memory: {
      get() {
        return this.spec.template.spec.domain.resources.requests.memory;
      },
      set(neu) {
        this.$set(this.spec.template.spec.domain.resources.requests, 'memory', neu)
      }
    },

    namespaceOptions() {
      const choices = this.$store.getters['cluster/all'](NAMESPACE);

      return sortBy(
        choices
          .map((obj) => {
            return {
              label: obj.nameDisplay,
              value: obj.id
            };
          }),
        'label'
      );
    },

    images() {
      return this.$store.getters['cluster/all'](IMAGE);
    },

    storageClasss() {
      return this.$store.getters['cluster/all'](STORAGE_CLASS)
    },

    defaultStorageClass() {
      let defaultValue = '';
      this.storageClasss.map( (O) => {
        if (O.metadata?.annotations?.[STORAGE_CLASS_LABEL.DEFAULT_CALSS]) {
          defaultValue = O.metadata.name;
        }
      });
      return defaultValue
    },

    diskRows: {
      get() {
        const _volumes = this.spec?.template?.spec?.volumes || [];
        const _dataVolumeTemplates = this.spec?.dataVolumeTemplates || [];
        const _disks = this.spec?.template?.spec?.domain?.devices?.disks || [];
        let out = [];

        if (_disks.length === 0) {
          out.push({
            index: 0,
            source: 'VM Image',
            disableSource: true,
            accessMode: 'ReadWriteOnce',
            bus: 'virtio',
            name: "rootdisk",
            pvcNS: "",
            pvcName: "",
            size: '10Gi',
            storageClassName: this.defaultStorageClass,
            url: this.imageName,
            volumeMode: "Filesystem",
            disableDelete: true,
            bootOrder: 1
          })
        } else {
          out = _disks.map( (DISK, index) => {
            const volume = _volumes.find( (V) => V.name === DISK.name);

            let source = '';
            let pvcName = '';
            let pvcNS = '';
            let accessMode = '';
            let size = '';
            let volumeMode = '';
            let storageClassName = '';
            let url = '';

            if (volume?.dataVolume && volume?.dataVolume?.name) {
              const volumeName = volume.dataVolume.name;

              const DVT = _dataVolumeTemplates.find( (T) => {
                return T.metadata.name === volumeName;
              });

              if (DVT) {
                if (DVT.spec?.source?.blank) {
                  source = SOURCE_TYPE.BLANK;
                } else if (DVT.spec?.source?.pvc) {
                  source = SOURCE_TYPE.ATTACH_CLONED;
                  pvcName = DVT.spec?.source?.pvcname;
                  pvcNS = DVT.spec?.source?.pvc.namespace;
                } else if (DVT.spec?.source?.http?.url) {
                  source = SOURCE_TYPE.URL;
                  url = DVT.spec.source.http.url;

                  // this.imageName = this.getImageSource(DVT.spec.source.http.url)
                }

                accessMode = DVT?.spec?.pvc?.accessModes?.[0];
                size = DVT?.spec?.pvc?.resources?.requests?.storage || '10Gi';
                volumeMode = DVT?.spec?.pvc?.volumeMode;
                storageClassName = DVT?.spec?.pvc?.storageClassName;
              }
            }

            const bus = DISK.disk.bus;

            return {
              index,
              source,
              name: DISK.name,
              bus,
              pvcName,
              pvcNS,
              accessMode,
              size,
              volumeMode,
              url,
              storageClassName,
            };
          });
        }

        return out.filter( (O) => {
          return O.name !== 'cloudinitdisk';
        });
      },

      set(neu) {
        this.parseDiskRows(neu);
      }
    },

    networkRows: {
      get() {
        const networks = this.spec?.template?.spec?.networks || [];
        const interfaces = this.spec?.template?.spec?.domain?.devices?.interfaces || [];

        const out = interfaces.map( (O, index) => {
          const network = networks.find( (N) => {
            return O.name === N.name;
          });

          const type = O.sriov ? 'sriov' : O.bridge ? 'bridge' : 'masquerade';

          return {
            ...O,
            type,
            networkName: network?.multus?.networkName || 'Pod Networking',
            index
          };
        });

        return out;
      },

      set(neu) {
        this.parseNetworkRows(neu);
      }
    }
  },

  methods: {
    updateSSHKey(neu) {
      this.$set(this, 'sshKey', neu);
    },
    normalizeSpec() {
      this.parseNetworkRows(this.networkRows);
      this.parseDiskRows(this.diskRows);
    },

    getImageSource(url) {
      const image = this.images.find( (I) => {
        return url === I?.status?.downloadUrl;
      });
      return image?.spec?.displayName
    },

    parseDisk(R) {
      const _disk = {
        disk: { bus: R.bus },
        name: R.name,
      };
      
      if ( R.bootOrder ) {
        _disk.bootOrder = R.bootOrder;
      }

      return _disk;
    },

    parseVolume(R, dataVolumeName) {
      const _volume = {
        name:       R.name,
      };

      if (R.source === SOURCE_TYPE.CONTAINER_DISK) {
        _volume.containerDisk = {
          image: R.container
        }
      } else {
        _volume.dataVolume = {
          name: dataVolumeName
        }
      }

      return _volume;
    },

    parseDateVolumeTemplate(R, dataVolumeName) {
      const accessModel = R.accessMode;
      
      const _dataVolumeTemplate = {
        apiVersion: 'cdi.kubevirt.io/v1alpha1',
        kind:       'DataVolume',
        metadata:   { name: dataVolumeName },
        spec:       {
          pvc: {
            accessModes: [
              accessModel
            ],
            resources:  { requests: { storage: R.size } },
            volumeMode: R.volumeMode
          }
        }
      };

      switch (R.source) {
        case SOURCE_TYPE.BLANK:
          _dataVolumeTemplate.spec.pvc.storageClassName = R.storageClassName;
          _dataVolumeTemplate.spec.source = { blank: {} };
          break;

        case SOURCE_TYPE.URL:
          _dataVolumeTemplate.spec.source = { http: { url: this.source } };
      }

      return _dataVolumeTemplate
    },

    parseDiskRows(disk) {
      const disks = [];
      const volumes = [];
      const dataVolumeTemplates = [];

      disk.forEach( (R) => {
        const dataVolumeName = `${ this.hostname }-${ R.name }-${ randomstring.generate(5).toLowerCase() }`;

        const _disk = this.parseDisk(R);
        const _volume = this.parseVolume(R, dataVolumeName);
        const _dataVolumeTemplate = this.parseDateVolumeTemplate(R, dataVolumeName);

        disks.push(_disk);
        volumes.push(_volume);

        if (R.source !== SOURCE_TYPE.CONTAINER_DISK) {
          dataVolumeTemplates.push(_dataVolumeTemplate);
        }
      });

      const sshString = this.getSSHString();

      if (!disks.find( D => D.name === 'cloudinitdisk')) {
        disks.push({
          name: 'cloudinitdisk',
          disk: { bus: 'virtio' }
        });

        volumes.push({
          name:             'cloudinitdisk',
          cloudInitNoCloud: {
            userData: `#cloud-config\nname: default\nhostname: ${ this.hostname }\nssh_authorized_keys:${ sshString }`,
            // networkData: this.getNetworkData()
          }
        });
      }

      const spec = {
        ...this.spec,
        running:  this.isRunning,
        dataVolumeTemplates,
        template: {
          ...this.spec.template,
          spec: {
            ...this.spec.template.spec,
            domain: {
              ...this.spec.template.spec.domain,
              devices: {
                ...this.spec.template.spec.domain.devices,
                disks,
              },
            },
            volumes
          }
        }
      };

      if (volumes.length === 0) {
        delete spec.template.spec.volumes;
        delete spec.dataVolumeTemplates;
      }

      if (this.pageType === 'vm') {
        this.$set(this.value, 'spec', spec);
      } else {
        this.$set(this, 'spec', spec);
      }
    },

    getSSHString() {
      const sshValue = this.ssh.filter( (O) => {
        if (this.sshKey.includes(O.metadata.name)) {
          return true;
        }
      });

      let sshString = '';

      sshValue.map( (S) => {
        const sshKey = S.spec.publicKey.replace(/\s+/g, '    \n    ');

        sshString += `\n   - >-\n    ${ sshKey }`;
      });

      return sshString
    },

    getNetworkData() {
      let initScript = '';

      if (this.cloudInit) {
        initScript += `\n${ this.cloudInit }`;
      }
      return `network:\n  version: 1\n  config:\n ${ initCloudNetworkData }`;
    },

    parseNetworkRows(networkRow) {
      const interfaces = [];
      const networks = [];

      networkRow.forEach( (O) => {
        const _interface = {};
        const network = {};

        if (O.name === 'nic-0') {
          _interface.masquerade = {};
          network.pod = {};
        } else {
          if (O.type === 'sriov') {
            _interface.sriov = {};
          } else if (O.type === 'bridge') {
            _interface.bridge = {};
          }
          _interface.macAddress = O.macAddress;
          network.multus = { networkName: O.networkName };
        }

        _interface.model = O.model;
        _interface.name = O.name;
        network.name = O.name;

        interfaces.push(_interface);

        networks.push(network);
      });

      // eslint-disable-next-line no-console
      const spec = {
        ...this.spec.template.spec,
        domain: {
          ...this.spec.template.spec.domain,
          devices: {
            ...this.spec.template.spec.domain.devices,
            interfaces,
          },
        },
        networks
      };
      console.log('------network', interfaces, networkRow, spec);

      if (this.pageType === 'vm') {
        this.$set(this.value.spec.template, 'spec', spec);
      } else {
        this.$set(this.spec.template, 'spec', spec);
      }
    },
  },

  watch: {
    imageName: {
      handler(neu) {
        const images = this.$store.getters['cluster/all'](IMAGE);
        const image = images.find( O => O.spec.displayName === neu );

        this.source = image?.status?.downloadUrl;
      },
      immediate: true
    },
  }
};