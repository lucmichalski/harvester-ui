<script>
import Footer from '@/components/form/Footer';
import Collapse from '@/components/Collapse';
import Checkbox from '@/components/form/Checkbox';
import AddSSHKey from '@/components/form/AddSSHKey';
import DiskModal from '@/components/form/DiskModal';
import LabeledInput from '@/components/form/LabeledInput';
import NetworkModal from '@/components/form/NetworkModal';
import MemoryUnit from '@/components/form/MemoryUnit';
import { VM_TEMPLATE } from '@/config/types';
import VM_MIXIN from '@/mixins/vm';
import CreateEditView from '@/mixins/create-edit-view';
import { _ADD } from '@/config/query-params';
import { defaultAsyncData } from '@/components/ResourceDetail';
import ChooseImage from '../kubevirt.io.virtualmachine/ChooseImage';
import CloudConfig from '../kubevirt.io.virtualmachine/CloudConfig';

export default {
  name: 'EditVMTEMPLATE',

  components: {
    Footer,
    Checkbox,
    Collapse,
    LabeledInput,
    MemoryUnit,
    AddSSHKey,
    DiskModal,
    CloudConfig,
    NetworkModal,
    ChooseImage
  },

  mixins: [CreateEditView, VM_MIXIN],

  props: {
    value: {
      type:     Object,
      required: true,
    },
  },

  asyncData(ctx) {
    const parentOverride = { displayName: 'Template' };
    const resource = ctx.params.resource;

    return defaultAsyncData(ctx, resource, parentOverride);
  },

  data() {
    let templateSpec = this.value.spec;
    const choices = this.$store.getters['cluster/all'](VM_TEMPLATE.version);

    let spec = null;

    if (!templateSpec) {
      templateSpec = {
        description:      '',
        defaultVersionId: ''
      };
      this.$set(this.value, 'spec', templateSpec);
    } else {
      spec = choices.find( O => templateSpec.defaultVersionId === O.id )?.spec?.vm || null;
    }

    if ( !spec ) {
      spec = {
        dataVolumeTemplates: [],
        template:            {
          metadata: {},
          spec:     {
            domain: {
              cpu: {
                cores:   null,
                sockets: 1,
                threads: 1
              },
              devices: {
                interfaces:                 [{
                  masquerade: {},
                  model:      'virtio',
                  name:       'default'
                }],
                disks: [],
              },
              resources: { requests: { memory: '' } }
            },
            networks: [{
              name: 'default',
              pod:  {}
            }],
            volumes: []
          }
        }
      };
    }

    return {
      spec,
      templateName:     '',
      templates:        [],
      versionName:      '',
      versionOption:    [],
      description:      '',
      templateVersion:  [],
      defaultVersion:   null,
      isRunning:        true,
      useTemplate:      false,
      isDefaultVersion:  false,
      keyPairIds:       [],
    };
  },

  computed: {
    isAdd() {
      return this.$route.query.type === _ADD;
    },
    allTemplate() {
      return this.$store.getters['cluster/all'](VM_TEMPLATE.template);
    },
  },

  watch: {
    sshKey(neu) {
      const out = [];

      this.ssh.map( (I) => {
        if (neu.includes(I.metadata.name)) {
          const name = `${ I.metadata.namespace }/${ I.metadata.name }`;

          out.push(name);
        }
      });
      this.keyPairIds = out;
    }
  },

  created() {
    this.registerAfterHook(() => {
      this.saveVersion();
    });
  },

  mounted() {
    const imageName = this.$route.query?.image || '';

    this.imageName = imageName;
  },

  methods: {
    async saveVMT(buttonCb) {
      const isPass = this.verifyBefSave(buttonCb);

      if (!isPass) {
        return;
      }

      if (this.isCreate) {
        delete this.value.metadata.namespace;
      }
      await this.save(buttonCb);

      this.normalizeSpec();
    },

    async saveVersion() {
      this.normalizeSpec();

      const versionInfo = await this.$store.dispatch('management/request', {
        method:  'POST',
        headers: {
          'content-type': 'application/json',
          accept:         'application/json',
        },
        url:  `v1/harvester.cattle.io.virtualmachinetemplateversions`,
        data: {
          apiVersion: 'harvester.cattle.io/v1alpha1',
          kind:       'harvester.cattle.io.virtualmachinetemplateversion',
          type:       'harvester.cattle.io.virtualmachinetemplateversion',
          spec:       {
            templateId: `harvester-system/${ this.value.metadata.name }`,
            keyPairIds: this.keyPairIds,
            vm:         { ...this.spec }
          }
        },
      });

      try {
        if (this.isDefaultVersion) {
          this.defaultVersionId = versionInfo.id;
          this.setVersion(this.defaultVersionId, () => {});
        }
      } catch (err) {
        const message = err.message;

        this.errors = [message];
      }
    },

    verifyBefSave(buttonCb) {
      if (!this.spec.template.spec.domain.cpu.cores) {
        this.errors = [this.$store.getters['i18n/t']('validation.required', { key: 'Cpu' })];
        buttonCb(false);

        return false;
      }

      if (!this.memory.match(/[0-9]/)) {
        this.errors = [this.$store.getters['i18n/t']('validation.required', { key: 'Memory' })];
        buttonCb(false);

        return false;
      }

      return true;
    },

    async setVersion(id, buttonCb) {
      this.value.spec.defaultVersionId = id;
      try {
        const data = [{
          op: 'replace', path: '/spec/defaultVersionId', value: id
        }];

        await this.value.patch( data, { url: this.value.linkFor('view') });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(err);
      }
    },
    validateMax(value) {
      if (value > 100) {
        this.$set(this.spec.template.spec.domain.cpu, 'cores', 100);
      }
    }
  },
};
</script>

<template>
  <div id="vm">
    <div class="row">
      <div class="col span-6">
        <LabeledInput v-model="value.metadata.name" :disabled="isAdd" label="Template Name" required />
      </div>

      <div class="col span-6">
        <LabeledInput v-model="value.spec.description" label="Description" />
      </div>
    </div>
    <div class="min-spacer"></div>

    <Checkbox v-if="isAdd" v-model="isDefaultVersion" label="Default version" type="checkbox" />
    <div class="spacer"></div>

    <ChooseImage v-model="imageName" title="Choose an image(optional):" />

    <div class="spacer"></div>

    <h2>CPU & Memory::</h2>
    <div class="row">
      <div class="col span-5">
        <LabeledInput
          v-model.number="spec.template.spec.domain.cpu.cores"
          v-int-number
          min="1"
          type="number"
          label="CPU Request(core)"
          required
          @input="validateMax"
        />
      </div>

      <div class="col span-7">
        <MemoryUnit v-model="memory" value-name="Memory" :value-col="8" :unit-col="4" />
      </div>
    </div>

    <div class="spacer"></div>

    <h2>Add disk storage:</h2>
    <DiskModal v-model="diskRows" owner="template" />

    <div class="spacer"></div>

    <h2>Networks:</h2>
    <NetworkModal v-model="networkRows" />

    <div class="spacer"></div>

    <h2>Authentication:</h2>
    <AddSSHKey :ssh-key="sshKey" @update:sshKey="updateSSHKey" />

    <div class="spacer"></div>

    <Collapse :open.sync="showCloudInit" title="Advanced Options">
      <CloudConfig @updateCloudConfig="updateCloudConfig" />
    </Collapse>

    <div class="spacer"></div>

    <Footer :mode="mode" :errors="errors" @save="saveVMT" @done="done" />
  </div>
</template>
