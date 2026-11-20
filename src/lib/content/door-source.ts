// Original, display-only C excerpts inspired by Linux kernel subsystems.
const excerpts = [
  String.raw`/* 01 / kernel/sched/runqueue_view.c */
#include <linux/cpumask.h>
#include <linux/seq_file.h>

struct rq_sample {
        u64 clock;
        unsigned int runnable;
        unsigned int cpu;
};

static void rq_collect(struct rq_sample *s, struct rq *rq, int cpu)
{
        unsigned long flags;

        raw_spin_lock_irqsave(&rq->view_lock, flags);
        s->clock = rq->clock;
        s->runnable = rq->nr_running;
        s->cpu = cpu;
        raw_spin_unlock_irqrestore(&rq->view_lock, flags);
}

static int rq_dump(struct seq_file *m, void *unused)
{
        struct rq_sample s;
        int cpu;

        for_each_online_cpu(cpu) {
                rq_collect(&s, cpu_rq(cpu), cpu);
                seq_printf(m, "cpu=%03u runnable=%u clock=%llu\n",
                           s.cpu, s.runnable, s.clock);
        }
        return 0;
}`,
  String.raw`/* 02 / mm/folio_census.c */
#include <linux/mm.h>
#include <linux/pagevec.h>

struct folio_census {
        unsigned long resident;
        unsigned long dirty;
        unsigned long under_writeback;
};

static void census_mapping(struct address_space *mapping,
                           struct folio_census *totals)
{
        struct folio_batch batch;
        pgoff_t cursor = 0;
        unsigned int i;

        folio_batch_init(&batch);
        while (filemap_get_folios(mapping, &cursor, ULONG_MAX, &batch)) {
                for (i = 0; i < folio_batch_count(&batch); ++i) {
                        struct folio *f = batch.folios[i];
                        unsigned int pages = folio_nr_pages(f);

                        totals->resident += pages;
                        if (folio_test_dirty(f))
                                totals->dirty += pages;
                        if (folio_test_writeback(f))
                                totals->under_writeback += pages;
                }
                folio_batch_release(&batch);
                cond_resched();
        }
}`,
  String.raw`/* 03 / block/queue_histogram.c */
#include <linux/blk-mq.h>
#include <linux/log2.h>

#define LATENCY_BUCKETS 24

struct latency_hist {
        atomic64_t bucket[LATENCY_BUCKETS];
        atomic64_t total_ns;
};

static void record_completion(struct latency_hist *h,
                              const struct request *rq, u64 now)
{
        u64 elapsed = now - rq->start_time_ns;
        u64 usec = div_u64(elapsed, NSEC_PER_USEC);
        unsigned int slot = min_t(unsigned int, ilog2(usec | 1),
                                  LATENCY_BUCKETS - 1);

        atomic64_inc(&h->bucket[slot]);
        atomic64_add(elapsed, &h->total_ns);
}

static void write_histogram(struct seq_file *m, const struct latency_hist *h)
{
        unsigned int slot;

        for (slot = 0; slot < LATENCY_BUCKETS; slot++)
                seq_printf(m, "%8llu us %12lld completions\n",
                           BIT_ULL(slot), atomic64_read(&h->bucket[slot]));
}`,
  String.raw`/* 04 / net/core/link_sampler.c */
#include <linux/netdevice.h>
#include <linux/rcupdate.h>

struct link_sample {
        u64 rx;
        u64 tx;
        unsigned int carriers;
};

static void sample_namespace_links(struct net *net, struct link_sample *s)
{
        const struct net_device *dev;
        struct rtnl_link_stats64 storage;
        const struct rtnl_link_stats64 *stats;

        memset(s, 0, sizeof(*s));
        rcu_read_lock();
        for_each_netdev_rcu(net, dev) {
                if (!netif_running(dev))
                        continue;
                stats = dev_get_stats((struct net_device *)dev, &storage);
                s->rx += stats->rx_bytes;
                s->tx += stats->tx_bytes;
                s->carriers += netif_carrier_ok(dev);
        }
        rcu_read_unlock();
}`,
  String.raw`/* 05 / fs/inode_clock.c */
#include <linux/fs.h>
#include <linux/time64.h>

struct inode_clock {
        struct timespec64 modified;
        struct timespec64 changed;
        loff_t size;
        unsigned long ino;
};

static void read_inode_clock(struct inode *inode, struct inode_clock *out)
{
        spin_lock(&inode->i_lock);
        out->modified = inode_get_mtime(inode);
        out->changed = inode_get_ctime(inode);
        out->size = i_size_read(inode);
        out->ino = inode->i_ino;
        spin_unlock(&inode->i_lock);
}

static void print_inode_clock(struct seq_file *m, const struct inode_clock *c)
{
        seq_printf(m, "ino=%lu bytes=%lld\n", c->ino, c->size);
        seq_printf(m, "mtime=%lld.%09lu ctime=%lld.%09lu\n",
                   c->modified.tv_sec, c->modified.tv_nsec,
                   c->changed.tv_sec, c->changed.tv_nsec);
}`,
  String.raw`/* 06 / kernel/time/tick_jitter.c */
#include <linux/hrtimer.h>
#include <linux/ktime.h>

struct tick_probe {
        struct hrtimer timer;
        ktime_t step;
        s64 peak_ns;
        u64 missed;
};

static enum hrtimer_restart tick_probe_update(struct hrtimer *timer)
{
        struct tick_probe *p = container_of(timer, struct tick_probe, timer);
        ktime_t now = hrtimer_cb_get_time(timer);
        ktime_t scheduled = hrtimer_get_expires(timer);
        s64 jitter_ns = ktime_to_ns(ktime_sub(now, scheduled));
        u64 intervals;

        if (jitter_ns > READ_ONCE(p->peak_ns))
                WRITE_ONCE(p->peak_ns, jitter_ns);
        intervals = hrtimer_forward(timer, now, p->step);
        if (intervals > 1)
                p->missed += intervals - 1;
        return HRTIMER_RESTART;
}`,
  String.raw`/* 07 / drivers/hwmon/thermal_window.c */
#include <linux/hwmon.h>
#include <linux/mutex.h>

#define THERMAL_WINDOW 16

struct thermal_window {
        struct mutex lock;
        long reading[THERMAL_WINDOW];
        unsigned int head;
        unsigned int count;
};

static long thermal_average(struct thermal_window *w)
{
        long sum = 0, result = 0;
        unsigned int i;

        mutex_lock(&w->lock);
        for (i = 0; i < w->count; i++)
                sum += w->reading[i];
        if (w->count)
                result = DIV_ROUND_CLOSEST(sum, (long)w->count);
        mutex_unlock(&w->lock);
        return result;
}`,
  String.raw`/* 08 / drivers/gpu/drm/mode_inventory.c */
#include <drm/drm_connector.h>
#include <drm/drm_modes.h>

static void report_connector(struct seq_file *m, struct drm_connector *c)
{
        struct drm_display_mode *mode;
        unsigned int widest = 0;
        unsigned int count = 0;

        lockdep_assert_held(&c->dev->mode_config.mutex);
        list_for_each_entry(mode, &c->modes, head) {
                count++;
                widest = max_t(unsigned int, widest, mode->hdisplay);
                if (!(mode->type & DRM_MODE_TYPE_PREFERRED))
                        continue;
                seq_printf(m, "%s preferred=%dx%d @ %d Hz\n",
                           c->name, mode->hdisplay, mode->vdisplay,
                           drm_mode_vrefresh(mode));
        }
        seq_printf(m, "advertised=%u max_width=%u status=%d\n",
                   count, widest, c->status);
}`,
  String.raw`/* 09 / drivers/input/event_density.c */
#include <linux/input.h>
#include <linux/percpu.h>

struct input_density {
        u32 key;
        u32 relative;
        u32 absolute;
        u32 frame;
};

static DEFINE_PER_CPU(struct input_density, event_density);

static void tally_input_event(unsigned int type, unsigned int code)
{
        switch (type) {
        case EV_KEY:
                this_cpu_inc(event_density.key);
                break;
        case EV_REL:
                this_cpu_inc(event_density.relative);
                break;
        case EV_ABS:
                this_cpu_inc(event_density.absolute);
                break;
        case EV_SYN:
                if (code == SYN_REPORT)
                        this_cpu_inc(event_density.frame);
                break;
        }
}`,
  String.raw`/* 10 / kernel/workqueue_age.c */
#include <linux/workqueue.h>
#include <linux/jiffies.h>

struct age_record {
        struct list_head link;
        unsigned long enqueued;
};

static unsigned long oldest_work_age(struct list_head *pending,
                                     spinlock_t *lock)
{
        struct age_record *entry;
        unsigned long oldest = jiffies;
        unsigned long flags;
        unsigned long now;

        spin_lock_irqsave(lock, flags);
        list_for_each_entry(entry, pending, link) {
                if (time_before(entry->enqueued, oldest))
                        oldest = entry->enqueued;
        }
        now = jiffies;
        spin_unlock_irqrestore(lock, flags);
        return jiffies_to_msecs(now - oldest);
}`,
  String.raw`/* 11 / drivers/usb/core/topology_note.c */
#include <linux/usb.h>
#include <linux/seq_file.h>

static const char *bus_tier(enum usb_device_speed speed)
{
        switch (speed) {
        case USB_SPEED_LOW:
        case USB_SPEED_FULL:
                return "legacy";
        case USB_SPEED_HIGH:
                return "high-speed";
        case USB_SPEED_SUPER:
        case USB_SPEED_SUPER_PLUS:
                return "superspeed";
        default:
                return "unknown";
        }
}

static int emit_usb_node(struct usb_device *udev, void *data)
{
        struct seq_file *m = data;

        seq_printf(m, "tree=%s level=%u port=%u tier=%s children=%u\n",
                   udev->devpath, udev->level, udev->portnum,
                   bus_tier(udev->speed), udev->maxchild);
        return 0;
}`,
  String.raw`/* 12 / kernel/trace/marker_fifo.c */
#include <linux/kfifo.h>
#include <linux/ktime.h>

struct marker {
        u64 ns;
        u32 category;
};

static DEFINE_KFIFO(marker_queue, struct marker, 128);
static DEFINE_SPINLOCK(marker_lock);
static atomic_t dropped_markers = ATOMIC_INIT(0);

static void record_marker(u32 category)
{
        struct marker event = {
                .ns = ktime_get_mono_fast_ns(),
                .category = category,
        };

        if (!kfifo_in_spinlocked(&marker_queue, &event, 1, &marker_lock))
                atomic_inc(&dropped_markers);
}

static bool consume_marker(struct marker *out)
{
        return kfifo_out_spinlocked(&marker_queue, out, 1, &marker_lock) == 1;
}`,
  String.raw`/* 13 / sound/core/pcm_window.c */
#include <sound/pcm.h>
#include <linux/math64.h>

struct pcm_window {
        u64 period_ns;
        u64 buffer_ns;
        unsigned int sample_rate;
};

static int describe_pcm_window(const struct snd_pcm_runtime *r,
                               struct pcm_window *w)
{
        unsigned int hz = READ_ONCE(r->rate);
        snd_pcm_uframes_t period = READ_ONCE(r->period_size);
        snd_pcm_uframes_t buffer = READ_ONCE(r->buffer_size);

        if (!hz || !period || period > buffer)
                return -EINVAL;
        w->sample_rate = hz;
        w->period_ns = mul_u64_u32_div(period, NSEC_PER_SEC, hz);
        w->buffer_ns = mul_u64_u32_div(buffer, NSEC_PER_SEC, hz);
        return 0;
}`,
  String.raw`/* 14 / lib/rbtree_deadlines.c */
#include <linux/rbtree.h>
#include <linux/ktime.h>

struct deadline_note {
        struct rb_node node;
        ktime_t expires;
        u32 tag;
};

static const struct deadline_note *find_deadline(const struct rb_root *root,
                                                 ktime_t floor)
{
        struct rb_node *node = root->rb_node;
        const struct deadline_note *next = NULL;

        while (node) {
                struct deadline_note *d = rb_entry(node, struct deadline_note, node);

                if (ktime_before(d->expires, floor)) {
                        node = node->rb_right;
                } else {
                        next = d;
                        node = node->rb_left;
                }
        }
        return next;
}`,
  String.raw`/* 15 / drivers/iio/accel/sample_axes.c */
#include <linux/iio/iio.h>
#include <linux/unaligned.h>

struct packed_axes {
        __le16 x;
        __le16 y;
        __le16 z;
        s64 timestamp __aligned(8);
};

static int publish_axes(struct iio_dev *indio, const u8 *frame, size_t len)
{
        struct packed_axes scan = {};

        if (len < 6)
                return -EINVAL;

        scan.x = cpu_to_le16(get_unaligned_le16(frame));
        scan.y = cpu_to_le16(get_unaligned_le16(frame + 2));
        scan.z = cpu_to_le16(get_unaligned_le16(frame + 4));

        return iio_push_to_buffers_with_timestamp(indio, &scan,
                                                   iio_get_time_ns(indio));
}`,
  String.raw`/* 16 / drivers/rtc/calendar_baseline.c */
#include <linux/rtc.h>
#include <linux/timekeeping.h>

struct calendar_baseline {
        time64_t device_seconds;
        time64_t system_seconds;
        s64 skew;
};

static int measure_calendar_skew(struct rtc_device *rtc,
                                 struct calendar_baseline *sample)
{
        struct rtc_time tm;
        int ret;

        ret = rtc_read_time(rtc, &tm);
        if (ret)
                return ret;
        if (rtc_valid_tm(&tm))
                return -ERANGE;

        sample->device_seconds = rtc_tm_to_time64(&tm);
        sample->system_seconds = ktime_get_real_seconds();
        sample->skew = sample->device_seconds - sample->system_seconds;
        return 0;
}`,
  String.raw`/* 17 / kernel/irq/affinity_view.c */
#include <linux/irq.h>
#include <linux/cpumask.h>

static int show_irq_spread(struct seq_file *m, unsigned int virq,
                           struct cpumask *scratch)
{
        struct irq_data *data = irq_get_irq_data(virq);
        const struct cpumask *allowed;
        unsigned int active;

        if (!data)
                return -ENOENT;
        allowed = irq_data_get_affinity_mask(data);
        if (!allowed)
                return -ENODATA;

        cpus_read_lock();
        cpumask_and(scratch, allowed, cpu_online_mask);
        active = cpumask_weight(scratch);
        seq_printf(m, "irq=%u online_cpus=%u mask=%*pbl\n",
                   virq, active, cpumask_pr_args(scratch));
        cpus_read_unlock();
        return 0;
}`,
  String.raw`/* 18 / fs/proc/mount_digest.c */
#include <linux/fs.h>
#include <linux/seq_file.h>

struct mount_digest {
        unsigned int writable;
        unsigned int readonly;
        unsigned int invisible;
};

static void tally_mount(const struct vfsmount *mnt, struct mount_digest *d)
{
        unsigned int flags = READ_ONCE(mnt->mnt_flags);

        if (flags & MNT_INTERNAL)
                d->invisible++;
        else if (flags & MNT_READONLY)
                d->readonly++;
        else
                d->writable++;
}

static void write_mount_digest(struct seq_file *m, const struct mount_digest *d)
{
        seq_printf(m, "rw=%u ro=%u internal=%u total=%u\n",
                   d->writable, d->readonly, d->invisible,
                   d->writable + d->readonly + d->invisible);
}`,
  String.raw`/* 19 / drivers/pci/link_width_note.c */
#include <linux/pci.h>
#include <linux/bitfield.h>

struct pcie_link_note {
        unsigned int lanes;
        unsigned int speed;
        bool training;
};

static int read_link_note(struct pci_dev *dev, struct pcie_link_note *note)
{
        u16 status;
        int ret;

        if (!pci_is_pcie(dev))
                return -ENODEV;
        ret = pcie_capability_read_word(dev, PCI_EXP_LNKSTA, &status);
        if (ret)
                return pcibios_err_to_errno(ret);

        note->lanes = FIELD_GET(PCI_EXP_LNKSTA_NLW, status);
        note->speed = FIELD_GET(PCI_EXP_LNKSTA_CLS, status);
        note->training = !!(status & PCI_EXP_LNKSTA_LT);
        return 0;
}`,
  String.raw`/* 20 / mm/node_pressure_note.c */
#include <linux/mmzone.h>
#include <linux/vmstat.h>

struct node_pressure_note {
        unsigned long active;
        unsigned long inactive;
        unsigned long reclaimable;
};

static void sample_node_pressure(pg_data_t *node, struct node_pressure_note *out)
{
        out->active = node_page_state(node, NR_ACTIVE_ANON) +
                      node_page_state(node, NR_ACTIVE_FILE);
        out->inactive = node_page_state(node, NR_INACTIVE_ANON) +
                        node_page_state(node, NR_INACTIVE_FILE);
        out->reclaimable = node_page_state(node, NR_SLAB_RECLAIMABLE_B) >> PAGE_SHIFT;
}

static unsigned long inactive_per_mille(const struct node_pressure_note *s)
{
        unsigned long pages = s->active + s->inactive;

        return pages ? mult_frac(s->inactive, 1000UL, pages) : 0;
}`,
  String.raw`/* 21 / drivers/leds/pulse_envelope.c */
#include <linux/leds.h>
#include <linux/math64.h>

struct pulse_envelope {
        u32 rise_ms;
        u32 hold_ms;
        u32 fall_ms;
};

static enum led_brightness envelope_level(const struct pulse_envelope *p,
                                          u32 elapsed, u32 peak)
{
        if (elapsed < p->rise_ms)
                return mul_u64_u32_div(elapsed, peak, p->rise_ms);

        elapsed -= p->rise_ms;
        if (elapsed < p->hold_ms)
                return peak;

        elapsed -= p->hold_ms;
        if (elapsed >= p->fall_ms)
                return LED_OFF;

        return mul_u64_u32_div(p->fall_ms - elapsed, peak, p->fall_ms);
}`,
  String.raw`/* 22 / net/core/queue_backlog_note.c */
#include <linux/skbuff.h>
#include <linux/ktime.h>

struct backlog_note {
        unsigned int packets;
        size_t bytes;
        ktime_t first_arrival;
};

static void sample_backlog(struct sk_buff_head *head, struct backlog_note *s)
{
        struct sk_buff *skb;
        unsigned long flags;

        spin_lock_irqsave(&head->lock, flags);
        s->packets = skb_queue_len(head);
        skb = skb_peek(head);
        s->first_arrival = skb ? skb->tstamp : 0;
        s->bytes = 0;
        skb_queue_walk(head, skb)
                s->bytes += skb->len;
        spin_unlock_irqrestore(&head->lock, flags);
}`,
  String.raw`/* 23 / kernel/cpu/capacity_map.c */
#include <linux/sched/topology.h>
#include <linux/topology.h>

struct capacity_map {
        unsigned long total;
        unsigned long peak;
        int fastest_cpu;
};

static void build_capacity_map(const struct cpumask *mask, struct capacity_map *m)
{
        unsigned long scale;
        int cpu;

        m->total = 0;
        m->peak = 0;
        m->fastest_cpu = -1;
        for_each_cpu(cpu, mask) {
                scale = arch_scale_cpu_capacity(cpu);
                m->total += scale;
                if (scale > m->peak) {
                        m->peak = scale;
                        m->fastest_cpu = cpu;
                }
        }
}`,
  String.raw`/* 24 / lib/archive_manifest.c */
#include <linux/crc32.h>
#include <linux/scatterlist.h>

struct manifest_digest {
        u32 crc;
        size_t total_bytes;
};

static void digest_manifest(struct scatterlist *sg, unsigned int entries,
                            struct manifest_digest *out)
{
        struct sg_mapping_iter iter;
        u32 rolling_crc = ~0U;
        size_t total = 0;

        sg_miter_start(&iter, sg, entries, SG_MITER_FROM_SG);
        while (sg_miter_next(&iter)) {
                rolling_crc = crc32_le(rolling_crc, iter.addr, iter.length);
                total += iter.length;
        }
        sg_miter_stop(&iter);
        out->crc = ~rolling_crc;
        out->total_bytes = total;
}`,
  String.raw`/* 25 / drivers/northpole/sleigh_telemetry.c */
#include <linux/seqlock.h>
#include <linux/ktime.h>

#define NORTH_POLE_OVERRIDE     BIT(25)
#define ROOFTOP_BEACONS         9

struct sleigh_frame {
        u64 timestamp_ns;
        unsigned long beacons;
        unsigned long flags;
        unsigned int gifts_in_transit;
};

struct sleigh_console {
        seqlock_t lock;
        struct sleigh_frame frame;
};

static void snapshot_sleigh(struct sleigh_console *console,
                            struct sleigh_frame *out)
{
        unsigned int seq;

        do {
                seq = read_seqbegin(&console->lock);
                *out = console->frame;
        } while (read_seqretry(&console->lock, seq));
}

static bool sleigh_ready(const struct sleigh_frame *f)
{
        return (f->flags & NORTH_POLE_OVERRIDE) &&
               bitmap_weight(&f->beacons, ROOFTOP_BEACONS) == ROOFTOP_BEACONS;
}

/* Merry Christmas. May your pager stay quiet. */`
];

export function doorSource(day: number): string {
  const excerpt = excerpts[day - 1];
  return excerpt ? `${excerpt}\n\n` : '';
}
